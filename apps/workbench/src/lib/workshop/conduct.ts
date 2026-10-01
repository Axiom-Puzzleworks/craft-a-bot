import type { ControlMap, WorkflowSpec } from '@craftabot/core';
import type { CampaignCell, CampaignReport, ObligationRow } from '@craftabot/evals';
import { wilson } from '@craftabot/metrics';
import { CONSUMER_DUTY_OUTCOMES, OBLIGATION_TAGS } from '@craftabot/pack-fs-bank';

/**
 * **The Conduct fold** (WP88, `79-CONDUCT-AND-MODEL-RISK.md` §3; `64-…` §6.7):
 * a stored campaign report as the compliance reviewer reads it — the
 * Consumer Duty's four outcomes first, then every other obligation the
 * report carries, each with the report's own obligation row and the cases
 * behind it; vulnerability recognised × acted on as a 2×2; DISP's
 * evaluators; tipping-off and KYC as pass rates. Every number is the
 * report's row or a call into `@craftabot/metrics`; the page draws.
 */
export const VULNERABILITY_EVALUATOR = 'fs-advice/vulnerability-actioned';
export const TIPPING_OFF_EVALUATOR = 'fs-fraud/no-tip-off';
export const KYC_EVALUATOR = 'fs-fraud/caller-verified-before-action';
/** The complaints desk's DISP evaluators share this prefix (`61-…`). */
export const DISP_EVALUATOR_PREFIX = 'fs-advice/complaint-';

/**
 * The obligation each lamp reads (WP135, `110-…` G107): its evaluators are the
 * ones the control maps cite on a row with that tag — every desk's own, not two
 * desks' — beside the ids above, which stand when no maps are given.
 */
export const CONDUCT_LAMP_TAGS = {
	tippingOff: 'poca:tipping-off',
	kyc: 'mlr:kyc',
	disp: 'fca:disp:complaints'
} as const;

/** The evaluators the maps cite on rows carrying a tag, sorted. */
export function evaluatorsTagged(maps: readonly ControlMap[], tag: string): string[] {
	return [
		...new Set(
			maps.flatMap((map) =>
				map.rows
					.filter((row) => row.tags.includes(tag))
					.flatMap((row) =>
						row.evidence.filter((item) => item.kind === 'evaluator').map((item) => item.id)
					)
			)
		)
	].sort();
}

export interface ConductCase {
	cellId: string;
	scenario: string;
	itemId?: string | undefined;
	build: string;
	outcome: string;
	/** The evaluators this cell failed, by id. */
	failed: string[];
	runId?: string | undefined;
	workflowRunId?: string | undefined;
	/** The stage the obligation governs, from the workflow's stages; the first stage otherwise. */
	stageId?: string | undefined;
}

export interface ConductOutcome {
	tag: string;
	gloss: string;
	/** The Consumer Duty's four are the outcomes; the rest are the other obligations the report carries. */
	consumerDuty: boolean;
	row: ObligationRow | undefined;
	cases: ConductCase[];
	failing: number;
}

export interface RateWithBand {
	value: number;
	interval: [number, number];
	n: number;
}

export interface ConductFold {
	outcomes: ConductOutcome[];
	/** Recognised (the case disclosed) × acted on (the evaluator passed). */
	vulnerability: {
		recognisedActed: number;
		recognisedMissed: number;
		notRecognised: number;
		total: number;
	};
	disp: Array<{ evaluatorId: string; rate: RateWithBand }>;
	tippingOff: RateWithBand | undefined;
	kyc: RateWithBand | undefined;
	/** The evaluators each pooled lamp read (WP135): what the page names under it. */
	evaluators: { tippingOff: string[]; kyc: string[] };
}

const cellId = (cell: CampaignCell): string =>
	`${cell.scenario}:${cell.build}:${cell.guard}:${cell.brain}:${cell.seed}${cell.item ? `:${cell.item.id}` : ''}`;

/** The stage whose obligations name the tag, for a workflow; the first stage when none does. */
export function governingStage(
	workflow: Pick<WorkflowSpec, 'stages'> | undefined,
	tag: string
): string | undefined {
	if (!workflow) return undefined;
	const named = workflow.stages.find((stage) => stage.obligations?.includes(tag));
	return (named ?? workflow.stages[0])?.id;
}

function rateOver(cells: readonly CampaignCell[], evaluatorId: string): RateWithBand | undefined {
	return rateOverAll(cells, [evaluatorId]);
}

/** One rate over every judgment any of the evaluators gave: a cell judged by two counts twice. */
function rateOverAll(
	cells: readonly CampaignCell[],
	evaluatorIds: readonly string[]
): RateWithBand | undefined {
	let judged = 0;
	let passed = 0;
	for (const cell of cells)
		for (const evaluatorId of evaluatorIds) {
			const verdict = cell.evaluations[evaluatorId];
			if (verdict === undefined || cell.labels[evaluatorId] === 'not-applicable') continue;
			judged += 1;
			if (verdict === 'pass') passed += 1;
		}
	if (judged === 0) return undefined;
	const interval = wilson(passed, judged);
	return { value: passed / judged, interval: [interval[0], interval[1]], n: judged };
}

export function conductFold(
	report: CampaignReport,
	workflows: ReadonlyMap<string, WorkflowSpec> = new Map(),
	options: {
		workflowIdOfCell?: (cell: CampaignCell) => string | undefined;
		/** The control maps whose tagged rows name each lamp's evaluators (WP135); absent, the ids above. */
		controlMaps?: readonly ControlMap[];
	} = {}
): ConductFold {
	const maps = options.controlMaps ?? [];
	const tagged = (tag: string, fallback: readonly string[]) =>
		[...new Set([...fallback, ...evaluatorsTagged(maps, tag)])].sort();
	const tippingOffIds = tagged(CONDUCT_LAMP_TAGS.tippingOff, [TIPPING_OFF_EVALUATOR]);
	const kycIds = tagged(CONDUCT_LAMP_TAGS.kyc, [KYC_EVALUATOR]);
	const dispTagged = evaluatorsTagged(maps, CONDUCT_LAMP_TAGS.disp);
	const cells = report.cells;
	const rows = report.summary?.obligations ?? [];
	const tags = [
		...CONSUMER_DUTY_OUTCOMES,
		...[...new Set(cells.flatMap((cell) => cell.tags))]
			.filter((tag) => !(CONSUMER_DUTY_OUTCOMES as readonly string[]).includes(tag))
			.sort()
	];
	const outcomes: ConductOutcome[] = tags.map((tag) => {
		const mine = cells.filter((cell) => cell.tags.includes(tag));
		const cases = mine.map((cell): ConductCase => {
			const failed = Object.entries(cell.evaluations)
				.filter(([, verdict]) => verdict === 'fail')
				.map(([id]) => id);
			const workflowId = options.workflowIdOfCell?.(cell);
			return {
				cellId: cellId(cell),
				scenario: cell.scenario,
				itemId: cell.item?.id,
				build: cell.build,
				outcome: cell.outcome ?? 'unknown',
				failed,
				runId: cell.runId,
				workflowRunId: cell.workflow?.runId,
				stageId: governingStage(workflowId ? workflows.get(workflowId) : undefined, tag)
			};
		});
		return {
			tag,
			gloss: OBLIGATION_TAGS[tag] ?? tag,
			consumerDuty: (CONSUMER_DUTY_OUTCOMES as readonly string[]).includes(tag),
			row: rows.find((row) => row.tag === tag),
			cases,
			failing: cases.filter((entry) => entry.outcome !== 'SUCCESS' || entry.failed.length > 0)
				.length
		};
	});

	const vulnerabilityCells = cells.filter(
		(cell) => cell.evaluations[VULNERABILITY_EVALUATOR] !== undefined
	);
	const recognised = vulnerabilityCells.filter(
		(cell) => cell.labels[VULNERABILITY_EVALUATOR] !== 'not-applicable'
	);
	const vulnerability = {
		recognisedActed: recognised.filter(
			(cell) => cell.evaluations[VULNERABILITY_EVALUATOR] === 'pass'
		).length,
		recognisedMissed: recognised.filter(
			(cell) => cell.evaluations[VULNERABILITY_EVALUATOR] !== 'pass'
		).length,
		notRecognised: vulnerabilityCells.length - recognised.length,
		total: vulnerabilityCells.length
	};

	const dispIds = [...new Set(cells.flatMap((cell) => Object.keys(cell.evaluations)))]
		.filter((id) => id.startsWith(DISP_EVALUATOR_PREFIX) || dispTagged.includes(id))
		.sort();
	const disp = dispIds.flatMap((evaluatorId) => {
		const rate = rateOver(cells, evaluatorId);
		return rate ? [{ evaluatorId, rate }] : [];
	});

	return {
		outcomes,
		vulnerability,
		disp,
		tippingOff: rateOverAll(cells, tippingOffIds),
		kyc: rateOverAll(cells, kycIds),
		evaluators: { tippingOff: tippingOffIds, kyc: kycIds }
	};
}

/** A rate as the page shows it — the fold's own formatting, so the page holds no arithmetic. */
export const percent = (value: number | undefined): string =>
	value === undefined ? '—' : `${Math.round(value * 100)}%`;
export const band = (rate: RateWithBand | undefined): string =>
	rate ? `${percent(rate.interval[0])}–${percent(rate.interval[1])} · n=${rate.n}` : '';
/** A Lamp for a rate: lit when every applicable case passed, out when one failed, inconclusive when none applied. */
export const lampOf = (rate: RateWithBand | undefined): 'pass' | 'fail' | 'inconclusive' =>
	rate === undefined ? 'inconclusive' : rate.value === 1 ? 'pass' : 'fail';
/** The vulnerability Matrix's cells: recognised × acted on, each as its share of the judged cases; the fourth cell is not a case. */
export function vulnerabilityCellOf(
	v: ConductFold['vulnerability'],
	rowId: string,
	colId: string
): { value: number; label: string; note?: string | undefined } {
	const share = (count: number): number => (v.total === 0 ? 0 : count / v.total);
	if (rowId === 'recognised' && colId === 'acted')
		return { value: share(v.recognisedActed), label: String(v.recognisedActed) };
	if (rowId === 'recognised' && colId === 'missed')
		return { value: share(v.recognisedMissed), label: String(v.recognisedMissed) };
	if (rowId === 'not-recognised' && colId === 'missed')
		return {
			value: share(v.notRecognised),
			label: String(v.notRecognised),
			note: 'nothing disclosed'
		};
	return { value: 0, label: '—', note: 'not a case' };
}
export const slugOf = (tag: string): string => tag.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

/** The workflow a book cell ran: the report's own `workflowId` since v4 (WP112); for an earlier report, found by its stage ids. */
export function workflowIdOfCell(
	cell: CampaignCell,
	workflows: ReadonlyMap<string, Pick<WorkflowSpec, 'stages'>>
): string | undefined {
	if (cell.workflow?.workflowId !== undefined) return cell.workflow.workflowId;
	const ran = cell.workflow?.stages.map((stage) => stage.stageId);
	if (!ran || ran.length === 0) return undefined;
	for (const [id, workflow] of workflows) {
		const ids = workflow.stages.map((stage) => stage.id);
		if (ran.every((stageId) => ids.includes(stageId))) return id;
	}
	return undefined;
}
