import type { ConfusionLabelSemantics } from '@craftabot/core';
import { touchesPerCase, unattendedRate, wilson } from '@craftabot/metrics';
import { z } from 'zod';
import type { CampaignCell } from './campaign.js';

/**
 * **The campaign summary** (WP61, `50-DOMAIN-METRICS.md` §4.5): what the
 * readers read, folded once from the cells at the end of a run and carried
 * on the report, so markdown, JSON and the browser show one set of
 * numbers. Slices by scenario × guard × brain (and by cohort), the
 * confusion matrices of every evaluator that says what its labels mean,
 * the cohort rows, the obligation table by tag, and the case table — one
 * row per cell, the drill-through a fraud team reads. Pure over the cells.
 */
export const confusionSemanticsSchema = z.object({
	kind: z.literal('confusion'),
	truePositive: z.string().min(1),
	falsePositive: z.string().min(1),
	trueNegative: z.string().min(1),
	falseNegative: z.string().min(1)
});

const rates = z.record(z.string(), z.number());
const labelCounts = z.record(z.string(), z.record(z.string(), z.number().int().nonnegative()));
const stat = z.object({
	mean: z.number(),
	min: z.number(),
	max: z.number(),
	cells: z.number().int()
});

export const DERIVED_NAMES = ['precision', 'recall', 'f1', 'falsePositiveRate'] as const;
export type DerivedName = (typeof DERIVED_NAMES)[number];

export const confusionMatrixSchema = z.object({
	evaluatorId: z.string(),
	semantics: confusionSemanticsSchema,
	/** Which slice this matrix is over; `{}` is the whole report. */
	slice: z.object({
		scenario: z.string().optional(),
		guard: z.string().optional(),
		brain: z.string().optional()
	}),
	tp: z.number().int().nonnegative(),
	fp: z.number().int().nonnegative(),
	tn: z.number().int().nonnegative(),
	fn: z.number().int().nonnegative(),
	/** `undefined` when the denominator is empty — never 0, which would claim a rate. */
	precision: z.number().optional(),
	recall: z.number().optional(),
	f1: z.number().optional(),
	falsePositiveRate: z.number().optional()
});
export type ConfusionMatrix = z.infer<typeof confusionMatrixSchema>;

export const campaignSliceSchema = z.object({
	scenario: z.string(),
	guard: z.string(),
	brain: z.string(),
	cells: z.number().int().nonnegative(),
	errors: z.number().int().nonnegative(),
	successRate: z.number(),
	assertionPassRates: rates,
	/** Pass rate per evaluator over the cells it judged (inconclusive left out). */
	evaluatorPassRates: rates,
	/** Label counts per evaluator. */
	labels: labelCounts,
	caseMetrics: z.record(z.string(), stat)
});
export type CampaignSliceSummary = z.infer<typeof campaignSliceSchema>;

export const cohortRowSchema = z.object({
	attribute: z.string(),
	value: z.string(),
	cells: z.number().int().nonnegative(),
	successRate: z.number(),
	evaluatorPassRates: rates,
	labels: labelCounts,
	caseMetrics: z.record(z.string(), stat)
});
export type CohortRow = z.infer<typeof cohortRowSchema>;

export const obligationRowSchema = z.object({
	tag: z.string(),
	cells: z.number().int().nonnegative(),
	successRate: z.number(),
	evaluatorPassRates: rates,
	labels: labelCounts
});
export type ObligationRow = z.infer<typeof obligationRowSchema>;

export const caseRowSchema = z.object({
	scenario: z.string(),
	guard: z.string(),
	brain: z.string(),
	seed: z.number().int(),
	runId: z.string().optional(),
	outcome: z.string().optional(),
	cohort: z.record(z.string(), z.string()).optional(),
	ticks: z.number(),
	cost: z.number(),
	approvals: z.number(),
	labels: z.record(z.string(), z.string()),
	verdicts: z.record(z.string(), z.enum(['pass', 'fail', 'inconclusive'])),
	error: z.string().optional()
});
export type CaseRow = z.infer<typeof caseRowSchema>;

/**
 * **Human load by build** (WP80, `64-…` §6.4.1a; `68-METRICS.md` §2.3): over
 * a book campaign's cells, per build — a configuration, an autonomy level —
 * touches per case with its interval, the unattended rate, and the
 * ceiling-breach rate over the decisions that had a ceiling. Measured from
 * the workflow runs' stage records, the bottom-up figures the thought
 * experiment's scenario model assumes. Empty for a campaign of scenarios.
 */
export const humanLoadRowSchema = z.object({
	build: z.string(),
	configuration: z.string().optional(),
	autonomy: z.number().int().min(1).max(5).optional(),
	cells: z.number().int().nonnegative(),
	touchesPerCase: z.number(),
	touchesInterval: z.tuple([z.number(), z.number()]),
	touchesByKind: z.record(z.string(), z.number()),
	unattendedRate: z.number(),
	decisions: z.number().int().nonnegative(),
	breaches: z.number().int().nonnegative(),
	ceilingBreachRate: z.number(),
	breachInterval: z.tuple([z.number(), z.number()]),
	underpowered: z.boolean()
});
export type HumanLoadRow = z.infer<typeof humanLoadRowSchema>;

export const campaignSummarySchema = z.object({
	slices: z.array(campaignSliceSchema),
	matrices: z.array(confusionMatrixSchema),
	cohorts: z.array(cohortRowSchema),
	obligations: z.array(obligationRowSchema),
	cases: z.array(caseRowSchema),
	/** Defaulted, so every report written before WP80 parses. */
	humanLoad: z.array(humanLoadRowSchema).default([])
});
export type CampaignSummary = z.infer<typeof campaignSummarySchema>;

/** The Consumer Duty's four outcomes lead the obligation table when present (`48-…` §4.7). */
const FIRST_TAGS = [
	'fca:cd:products-services',
	'fca:cd:price-value',
	'fca:cd:understanding',
	'fca:cd:support'
];

export interface SummaryOptions {
	/** What an evaluator's labels mean, by id — from the registry at run time, or the stored matrices on a re-read. */
	semantics?: (evaluatorId: string) => ConfusionLabelSemantics | undefined;
}

const rate = (cells: readonly CampaignCell[], match: (cell: CampaignCell) => boolean): number =>
	cells.length === 0 ? 0 : cells.filter(match).length / cells.length;

function evaluatorIds(cells: readonly CampaignCell[]): string[] {
	return [...new Set(cells.flatMap((cell) => Object.keys(cell.evaluations)))].sort();
}

export function evaluatorPassRates(cells: readonly CampaignCell[]): Record<string, number> {
	const out: Record<string, number> = {};
	for (const id of evaluatorIds(cells)) {
		const judged = cells.filter(
			(cell) => cell.evaluations[id] !== undefined && cell.evaluations[id] !== 'inconclusive'
		);
		if (judged.length > 0) out[id] = rate(judged, (cell) => cell.evaluations[id] === 'pass');
	}
	return out;
}

export function labelCountsOf(
	cells: readonly CampaignCell[]
): Record<string, Record<string, number>> {
	const out: Record<string, Record<string, number>> = {};
	for (const cell of cells) {
		for (const [evaluatorId, label] of Object.entries(cell.labels ?? {})) {
			const counts = (out[evaluatorId] ??= {});
			counts[label] = (counts[label] ?? 0) + 1;
		}
	}
	return out;
}

function caseMetricStats(
	cells: readonly CampaignCell[]
): Record<string, { mean: number; min: number; max: number; cells: number }> {
	const values = new Map<string, number[]>();
	for (const cell of cells) {
		for (const [id, value] of Object.entries(cell.caseMetrics ?? {})) {
			const list = values.get(id);
			if (list) list.push(value);
			else values.set(id, [value]);
		}
	}
	return Object.fromEntries(
		[...values].map(([id, list]) => [
			id,
			{
				mean: list.reduce((total, value) => total + value, 0) / list.length,
				min: Math.min(...list),
				max: Math.max(...list),
				cells: list.length
			}
		])
	);
}

/** The four cells and the four derived rates for one evaluator over a set of cells. */
export function confusionOf(
	cells: readonly CampaignCell[],
	evaluatorId: string,
	semantics: ConfusionLabelSemantics
): Omit<ConfusionMatrix, 'evaluatorId' | 'semantics' | 'slice'> {
	let tp = 0;
	let fp = 0;
	let tn = 0;
	let fn = 0;
	for (const cell of cells) {
		const label = cell.labels?.[evaluatorId];
		if (label === semantics.truePositive) tp += 1;
		else if (label === semantics.falsePositive) fp += 1;
		else if (label === semantics.trueNegative) tn += 1;
		else if (label === semantics.falseNegative) fn += 1;
	}
	const ratio = (numerator: number, denominator: number) =>
		denominator === 0 ? undefined : numerator / denominator;
	const precision = ratio(tp, tp + fp);
	const recall = ratio(tp, tp + fn);
	const f1 =
		precision === undefined || recall === undefined
			? undefined
			: precision + recall === 0
				? 0
				: (2 * precision * recall) / (precision + recall);
	const falsePositiveRate = ratio(fp, fp + tn);
	return {
		tp,
		fp,
		tn,
		fn,
		...(precision !== undefined ? { precision } : {}),
		...(recall !== undefined ? { recall } : {}),
		...(f1 !== undefined ? { f1 } : {}),
		...(falsePositiveRate !== undefined ? { falsePositiveRate } : {})
	};
}

/** One derived number for a set of cells, or `undefined` when its denominator is empty. */
export function derivedOf(
	cells: readonly CampaignCell[],
	evaluatorId: string,
	derived: DerivedName,
	semantics: ConfusionLabelSemantics
): number | undefined {
	return confusionOf(cells, evaluatorId, semantics)[derived];
}

function groupBy<K extends string>(
	cells: readonly CampaignCell[],
	keyOf: (cell: CampaignCell) => K | undefined
): Map<K, CampaignCell[]> {
	const groups = new Map<K, CampaignCell[]>();
	for (const cell of cells) {
		const key = keyOf(cell);
		if (key === undefined) continue;
		const list = groups.get(key);
		if (list) list.push(cell);
		else groups.set(key, [cell]);
	}
	return groups;
}

export function summariseCampaign(
	cells: readonly CampaignCell[],
	options: SummaryOptions = {}
): CampaignSummary {
	const cardIds = [...new Set(cells.flatMap((cell) => Object.keys(cell.assertions)))];
	const sliceKey = (cell: CampaignCell) => `${cell.scenario} ${cell.guard} ${cell.brain}`;
	const slices: CampaignSliceSummary[] = [...groupBy(cells, sliceKey)].map(([key, mine]) => {
		const [scenario, guard, brain] = key.split(' ') as [string, string, string];
		return {
			scenario,
			guard,
			brain,
			cells: mine.length,
			errors: mine.filter((cell) => cell.error !== undefined).length,
			successRate: rate(mine, (cell) => cell.outcome === 'SUCCESS'),
			assertionPassRates: Object.fromEntries(
				cardIds.map((id) => [id, rate(mine, (cell) => cell.assertions[id] === true)])
			),
			evaluatorPassRates: evaluatorPassRates(mine),
			labels: labelCountsOf(mine),
			caseMetrics: caseMetricStats(mine)
		};
	});

	// Matrices: per labelled evaluator with semantics, the whole report and each slice.
	const matrices: ConfusionMatrix[] = [];
	const labelled = [...new Set(cells.flatMap((cell) => Object.keys(cell.labels ?? {})))].sort();
	for (const evaluatorId of labelled) {
		const semantics = options.semantics?.(evaluatorId);
		if (!semantics) continue;
		matrices.push({
			evaluatorId,
			semantics,
			slice: {},
			...confusionOf(cells, evaluatorId, semantics)
		});
		for (const [key, mine] of groupBy(cells, sliceKey)) {
			const [scenario, guard, brain] = key.split(' ') as [string, string, string];
			matrices.push({
				evaluatorId,
				semantics,
				slice: { scenario, guard, brain },
				...confusionOf(mine, evaluatorId, semantics)
			});
		}
	}

	// Cohorts: every attribute=value any cell carries.
	const cohorts: CohortRow[] = [];
	const attributes = [...new Set(cells.flatMap((cell) => Object.keys(cell.cohort ?? {})))].sort();
	for (const attribute of attributes) {
		const byValue = groupBy(cells, (cell) => cell.cohort?.[attribute]);
		for (const [value, mine] of [...byValue].sort(([a], [b]) => a.localeCompare(b))) {
			cohorts.push({
				attribute,
				value,
				cells: mine.length,
				successRate: rate(mine, (cell) => cell.outcome === 'SUCCESS'),
				evaluatorPassRates: evaluatorPassRates(mine),
				labels: labelCountsOf(mine),
				caseMetrics: caseMetricStats(mine)
			});
		}
	}

	// Obligations: by tag, the Consumer Duty's four first.
	const tags = [...new Set(cells.flatMap((cell) => cell.tags))].sort(
		(a, b) => rank(a) - rank(b) || a.localeCompare(b)
	);
	const obligations: ObligationRow[] = tags.map((tag) => {
		const mine = cells.filter((cell) => cell.tags.includes(tag));
		return {
			tag,
			cells: mine.length,
			successRate: rate(mine, (cell) => cell.outcome === 'SUCCESS'),
			evaluatorPassRates: evaluatorPassRates(mine),
			labels: labelCountsOf(mine)
		};
	});

	// Human load (WP80): by build, over the cells a workflow ran.
	const humanLoad: HumanLoadRow[] = [];
	const journeys = cells.filter((cell) => cell.workflow !== undefined);
	for (const [build, mine] of [...groupBy(journeys, (cell) => cell.build)].sort(([a], [b]) =>
		a.localeCompare(b)
	)) {
		const touched = mine.map((cell) => ({
			id: cell.workflow?.runId ?? '',
			touches: (cell.workflow?.touches ?? []).map((kind) => ({ kind }))
		}));
		const touches = touchesPerCase(touched);
		const unattended = unattendedRate(touched);
		const decisions = mine.reduce((sum, cell) => sum + (cell.workflow?.decisions.length ?? 0), 0);
		const breaches = mine.reduce((sum, cell) => sum + (cell.workflow?.breaches ?? 0), 0);
		const breach = wilson(breaches, decisions, 0.95);
		const first = mine[0]?.workflow;
		humanLoad.push({
			build,
			...(first?.configuration !== undefined ? { configuration: first.configuration } : {}),
			...(first?.autonomy !== undefined ? { autonomy: first.autonomy } : {}),
			cells: mine.length,
			touchesPerCase: touches.value,
			touchesInterval: [touches.interval[0], touches.interval[1]],
			touchesByKind: touches.detail ?? {},
			unattendedRate: unattended.value,
			decisions,
			breaches,
			ceilingBreachRate: decisions === 0 ? 0 : breaches / decisions,
			breachInterval: [breach[0], breach[1]],
			underpowered: touches.underpowered
		});
	}

	const cases: CaseRow[] = cells.map((cell) => ({
		scenario: cell.scenario,
		guard: cell.guard,
		brain: cell.brain,
		seed: cell.seed,
		...(cell.runId !== undefined ? { runId: cell.runId } : {}),
		...(cell.outcome !== undefined ? { outcome: cell.outcome } : {}),
		...(cell.cohort !== undefined ? { cohort: cell.cohort } : {}),
		ticks: cell.metrics.ticksUsed,
		cost: cell.metrics.tokensIn + cell.metrics.tokensOut,
		approvals: cell.metrics.approvalsRequested,
		labels: cell.labels ?? {},
		verdicts: cell.evaluations,
		...(cell.error !== undefined ? { error: cell.error } : {})
	}));

	return { slices, matrices, cohorts, obligations, cases, humanLoad };
}

function rank(tag: string): number {
	const index = FIRST_TAGS.indexOf(tag);
	return index === -1 ? FIRST_TAGS.length : index;
}
