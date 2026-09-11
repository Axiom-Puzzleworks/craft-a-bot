import type { StoredCampaignReport, StoredWorkflowRun, WorkflowRun } from '@craftabot/core';
import type { CampaignCell, CampaignReport } from '@craftabot/evals';
import {
	FAIRNESS_METRIC_IDS,
	counterfactualFlip,
	fairnessMetric,
	matchedPairDiscordance,
	pageHinkley,
	psiCategorical,
	ruleAgreement,
	wilson,
	type DecidedCase,
	type Decision,
	type FairnessMetricId,
	type FairnessResult,
	type FlipCase,
	type PageHinkleyResult,
	type PsiResult
} from '@craftabot/metrics';

/**
 * **The Model-risk fold** (WP88, `79-CONDUCT-AND-MODEL-RISK.md` §4; `64-…`
 * §6.7; GAP-3): the fairness workbench over a report's cells, the
 * counterfactual flip rate over the Pipeline's forks, the drift workbench
 * against a reference report, rule agreement over time, the synthetic
 * hazard's base rate. Every number is a call into `@craftabot/metrics`;
 * the page draws.
 */
const OUTCOMES: readonly Decision[] = ['approve', 'decline', 'refer'];

/** The cells the fairness metrics read: a cohort value as the group, the decision and the verdict, a stratum when asked. */
export function decidedCasesOf(
	cells: readonly CampaignCell[],
	across: string,
	stratify?: string
): DecidedCase[] {
	const cases: DecidedCase[] = [];
	for (const cell of cells) {
		const group = cell.cohort?.[across];
		if (group === undefined || !cell.decision) continue;
		cases.push({
			group,
			decision: cell.decision.outcome,
			verdict: cell.decision.verdict,
			repaid: cell.decision.repaid,
			stratum: stratify !== undefined ? cell.cohort?.[stratify] : undefined
		});
	}
	return cases;
}

/** Every cohort attribute the report's cells carry, sorted. */
export function cohortAttributes(cells: readonly CampaignCell[]): string[] {
	return [...new Set(cells.flatMap((cell) => Object.keys(cell.cohort ?? {})))].sort();
}

export interface FairnessRow {
	metric: FairnessMetricId;
	result?: FairnessResult | undefined;
	reason?: string | undefined;
}

export interface ModelRiskOptions {
	across: string;
	/** The last `window` cells, in the report's order; every cell when absent. */
	window?: number | undefined;
	stratify?: string | undefined;
	confidence?: number | undefined;
}

export function fairnessWorkbench(
	report: CampaignReport,
	options: ModelRiskOptions
): { rows: FairnessRow[]; matched: FairnessRow; cases: number; groups: string[] } {
	const cells =
		options.window !== undefined
			? report.cells.slice(Math.max(0, report.cells.length - options.window))
			: report.cells;
	const cases = decidedCasesOf(cells, options.across, options.stratify);
	const groups = [...new Set(cases.map((entry) => entry.group))].sort();
	const fairnessOptions = {
		...(options.confidence !== undefined ? { confidence: options.confidence } : {}),
		...(options.stratify !== undefined ? { stratify: 'stratum' as const } : {})
	};
	const rows: FairnessRow[] = FAIRNESS_METRIC_IDS.filter(
		(metric) => metric !== 'counterfactual-flip' && metric !== 'discordance'
	).map((metric) => {
		if (groups.length < 2)
			return { metric, reason: 'fewer than two cohorts with a decision in the window' };
		return {
			metric,
			result: fairnessMetric(
				metric as Exclude<FairnessMetricId, 'counterfactual-flip'>,
				cases,
				fairnessOptions
			)
		};
	});
	const paired = cases.filter((entry) => entry.pairId !== undefined);
	const matched: FairnessRow =
		paired.length === 0
			? {
					metric: 'discordance',
					reason: 'no matched pairs in this report — its cells carry no pair id'
				}
			: { metric: 'discordance', result: matchedPairDiscordance(paired, fairnessOptions) };
	return { rows, matched, cases: cases.length, groups };
}

/** The decision a stored workflow run took: the last stage output carrying an `outcome` the fairness metrics know. */
export function decisionOfStoredRun(run: Pick<WorkflowRun, 'stages'>): Decision | undefined {
	let found: Decision | undefined;
	for (const stage of run.stages) {
		const outcome = (stage.output.value as { outcome?: unknown } | undefined)?.outcome;
		if (typeof outcome === 'string' && (OUTCOMES as readonly string[]).includes(outcome))
			found = outcome as Decision;
	}
	return found;
}

export interface FlipFold {
	result?: FairnessResult | undefined;
	forks: number;
	/** Forks whose original is in the store and both of which decided. */
	compared: number;
	changed: number;
	reason?: string | undefined;
}

/** The counterfactual flip rate over the Pipeline's what-ifs: each fork against the run it was forked from. */
export function counterfactualFlips(stored: readonly StoredWorkflowRun[]): FlipFold {
	const byId = new Map(stored.map((entry) => [entry.run.id, entry]));
	const forks = stored.filter((entry) => entry.forkedFrom !== undefined);
	const flips: FlipCase[] = [];
	for (const fork of forks) {
		const original = byId.get(fork.forkedFrom?.runId ?? '');
		if (!original) continue;
		const before = decisionOfStoredRun(original.run);
		const after = decisionOfStoredRun(fork.run);
		if (before === undefined || after === undefined) continue;
		flips.push({ original: before, flipped: after });
	}
	if (flips.length === 0) {
		return {
			forks: forks.length,
			compared: 0,
			changed: 0,
			reason:
				forks.length === 0
					? 'no forks yet — a what-if from the Pipeline makes one'
					: 'no fork and its original both decided'
		};
	}
	const result = counterfactualFlip(flips);
	return {
		result,
		forks: forks.length,
		compared: flips.length,
		changed: flips.filter((flip) => flip.original !== flip.flipped).length
	};
}

export interface DriftFeature {
	feature: string;
	psi?: PsiResult | undefined;
	reason?: string | undefined;
}

/** PSI per feature — every cohort attribute and the decision outcome — between a report and a reference. */
export function driftWorkbench(
	current: CampaignReport,
	reference: CampaignReport | undefined
): DriftFeature[] {
	const features = [
		...new Set([
			...cohortAttributes(current.cells),
			...(reference ? cohortAttributes(reference.cells) : [])
		]),
		'decision'
	];
	if (!reference)
		return features.map((feature) => ({ feature, reason: 'choose a reference report' }));
	const valuesOf = (report: CampaignReport, feature: string): string[] =>
		feature === 'decision'
			? report.cells.flatMap((cell) => (cell.decision ? [cell.decision.outcome] : []))
			: report.cells.flatMap((cell) => {
					const value = cell.cohort?.[feature];
					return value === undefined ? [] : [value];
				});
	return features.map((feature) => {
		const a = valuesOf(reference, feature);
		const b = valuesOf(current, feature);
		if (a.length === 0 || b.length === 0) return { feature, reason: 'no values on one side' };
		return { feature, psi: psiCategorical(a, b) };
	});
}

/** Page–Hinkley over a series of values — the detector the workbench offers over any series the telemetry carries. */
export function detector(series: readonly number[]): PageHinkleyResult | undefined {
	return series.length < 3 ? undefined : pageHinkley(series);
}

export interface AgreementPoint {
	reportId: string;
	title: string;
	createdAt: string;
	value?: number | undefined;
	interval?: [number, number] | undefined;
	n: number;
}

/** Rule agreement per stored report, oldest first — the metric over time. */
export function agreementOverTime(
	reports: ReadonlyArray<{ stored: StoredCampaignReport; report: CampaignReport }>,
	across: string
): AgreementPoint[] {
	return [...reports]
		.sort((a, b) => a.stored.createdAt.localeCompare(b.stored.createdAt))
		.map(({ stored, report }) => {
			const cases = decidedCasesOf(report.cells, across).filter(
				(entry) => entry.verdict !== undefined
			);
			if (cases.length === 0)
				return { reportId: stored.id, title: stored.title, createdAt: stored.createdAt, n: 0 };
			const result = ruleAgreement(cases);
			return {
				reportId: stored.id,
				title: stored.title,
				createdAt: stored.createdAt,
				value: result.value,
				interval: [result.interval[0], result.interval[1]],
				n: cases.length
			};
		});
}

/** The synthetic hazard's base rate — the share of decided cells whose loan would not have performed — with its band. */
export function hazardBaseRate(
	cells: readonly CampaignCell[]
): { value: number; interval: [number, number]; n: number } | undefined {
	const known = cells.filter((cell) => cell.decision?.repaid !== undefined);
	if (known.length === 0) return undefined;
	const defaulted = known.filter((cell) => cell.decision?.repaid === false).length;
	const interval = wilson(defaulted, known.length);
	return { value: defaulted / known.length, interval: [interval[0], interval[1]], n: known.length };
}

/** A Lamp for a PSI reading: lit while stable, out once the band says watch or act, inconclusive without a reference. */
export const lampOfPsi = (psi: PsiResult | undefined): 'pass' | 'fail' | 'inconclusive' =>
	psi === undefined ? 'inconclusive' : psi.reading === 'stable' ? 'pass' : 'fail';
/** A Lamp for the detector: out once it raised, lit when it ran and did not, inconclusive on too short a series. */
export const lampOfDetector = (
	result: PageHinkleyResult | undefined
): 'pass' | 'fail' | 'inconclusive' =>
	result === undefined ? 'inconclusive' : result.detectedAt === undefined ? 'pass' : 'fail';
/** The window field as typed: a positive whole number, or every cell. */
export function windowOf(text: string): number | undefined {
	const parsed = Number.parseInt(text, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export const percent = (value: number | undefined): string =>
	value === undefined ? '—' : `${Math.round(value * 100)}%`;
export const fixed = (value: number | undefined, places = 3): string =>
	value === undefined ? '—' : value.toFixed(places);
