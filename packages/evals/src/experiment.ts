import {
	calibrationRow,
	type Bill,
	type CalibrationTable,
	type ReliabilityRecord,
	type Stack
} from '@craftabot/core';
import { z } from 'zod';
import {
	CONTEXT_LEVELS,
	contextSpecFor,
	experimentAxisSchema,
	experimentResultDigest,
	slugOf,
	type ContextLevel,
	type EffectRecord,
	type ExperimentAxis,
	type ExperimentResult,
	type ExperimentVerdict
} from '@craftabot/core';
import {
	fairnessMetric,
	firstDivergence,
	itemEstimate,
	itemReliability,
	newcombe,
	pathDistance,
	signTest,
	summarise,
	twoProportionZ,
	welch,
	wilson,
	zFor,
	type DecidedCase,
	type FairnessMetricId
} from '@craftabot/metrics';
import {
	campaignObjectSchema,
	campaignSchema,
	fairnessMetricNameSchema,
	type Campaign,
	type CampaignCell,
	type CampaignReport
} from './campaign.js';

/**
 * **Experiments** (WP89, `72-EXPERIMENTS.md` §3; `64-…` §6.8.1; decision D8;
 * tenet 19): a campaign-shaped artefact with a pre-registered hypothesis, a
 * factorial design over a campaign template's own axes, and an analysis
 * that states each treatment level's effect against the baseline as a
 * difference with its interval and *n* — never a pass/fail. `expandExperiment`
 * writes the campaigns; `analyseExperiment` folds their reports into
 * `EffectRecord`s and a verdict over the intervals.
 */
const campaignObject = campaignObjectSchema;

/** The campaign minus what the expansion supplies: id, title, seeds, gates. */
export const experimentTemplateSchema = campaignObject
	.omit({ schemaVersion: true, id: true, title: true, seeds: true, gates: true })
	.extend({ scenarios: campaignObject.shape.scenarios.default([]) });
export type ExperimentTemplate = z.infer<typeof experimentTemplateSchema>;

export const experimentFactorSchema = z
	.object({
		axis: experimentAxisSchema,
		levels: z.array(z.string().min(1)).min(2),
		/** The knob's name, for a `knob` axis. */
		knob: z.string().min(1).optional(),
		/**
		 * The controls a level tests (WP150, `110-CONTROL-SUITE-PLAN.md` §10):
		 * joined to that level's effects only, so a design that runs several
		 * controls against one baseline credits each with its own effect.
		 */
		controls: z.record(z.string(), z.array(z.string().min(1))).optional(),
		/**
		 * The metric each level is judged on first (WP150), pre-registered: its
		 * effects lead the level's, so the register quotes the metric the
		 * control was built to move rather than the design's first.
		 */
		primary: z.record(z.string(), z.string().min(1)).optional()
	})
	.refine((factor) => factor.axis !== 'knob' || factor.knob !== undefined, {
		message: 'a knob factor names its knob'
	})
	.refine(
		(factor) => Object.keys(factor.controls ?? {}).every((level) => factor.levels.includes(level)),
		{ message: 'a factor’s controls name its own levels' }
	)
	.refine(
		(factor) => Object.keys(factor.primary ?? {}).every((level) => factor.levels.includes(level)),
		{ message: 'a factor’s primary metrics name its own levels' }
	);
export type ExperimentFactor = z.infer<typeof experimentFactorSchema>;

const direction = z.enum(['lower-is-better', 'higher-is-better']);
const metricBase = { id: z.string().min(1), direction };
export const experimentMetricSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('outcome-rate'),
		...metricBase,
		outcome: z.enum(['SUCCESS', 'OUT_OF_STEPS', 'STOPPED_BY_USER', 'STOPPED_BY_GUARDRAIL', 'ERROR'])
	}),
	z.object({
		kind: z.literal('evaluator-pass-rate'),
		...metricBase,
		evaluatorId: z.string().min(1)
	}),
	/** How often a campaign assertion card held (WP150): the template's `assertionCards`, read per cell. */
	z.object({
		kind: z.literal('assertion-pass-rate'),
		...metricBase,
		cardId: z.string().min(1)
	}),
	z.object({
		kind: z.literal('label-rate'),
		...metricBase,
		evaluatorId: z.string().min(1),
		label: z.string().min(1)
	}),
	/**
	 * A **harm index** (plan 114 WP201): the mean over cells of a weight per label of a labelled evaluator, so a wrong approval can
	 * count for more than a needless referral. Each weight is in [0, 1]; a label with none weighs nothing; a cell the evaluator did not
	 * label is not counted.
	 */
	z.object({
		kind: z.literal('weighted-labels'),
		...metricBase,
		evaluatorId: z.string().min(1),
		weights: z.record(z.string().min(1), z.number().min(0).max(1))
	}),
	/** The mean of a world's per-case metric (`caseMetrics[name]`). */
	z.object({ kind: z.literal('case-metric'), ...metricBase, name: z.string().min(1) }),
	z.object({
		kind: z.literal('cost'),
		...metricBase,
		of: z.enum(['tokens', 'approvals', 'escalations', 'touches', 'breaches'])
	}),
	z.object({
		kind: z.literal('fairness'),
		...metricBase,
		metric: fairnessMetricNameSchema,
		across: z.string().min(1),
		stratify: z.string().min(1).optional()
	})
]);
export type ExperimentMetric = z.infer<typeof experimentMetricSchema>;

export const experimentSchema = z
	.object({
		schemaVersion: z.literal(1),
		id: z.string().min(1),
		title: z.string().min(1),
		/** One sentence, pre-registered. */
		hypothesis: z.string().min(1),
		/** The control-map row ids (or policy-card / guard / evaluator ids) under test. */
		controls: z.array(z.string()).default([]),
		obligations: z.array(z.string()).default([]),
		design: z.object({
			template: experimentTemplateSchema,
			factors: z.array(experimentFactorSchema).min(1),
			/** The baseline level per axis. */
			baseline: z.partialRecord(experimentAxisSchema, z.string()),
			metrics: z.array(experimentMetricSchema).min(1),
			seeds: z.array(z.number().int()).min(1),
			replicates: z.number().int().positive().default(1),
			/**
			 * WP191 (`113-RECORDING-AND-RELIABILITY.md` §4.6): how many times each cell is performed — the same item, seed and build
			 * with fresh model draws. Not `replicates`, which is a new seed (a different case). Absent is once, and every result
			 * is as it was; above one, the analysis takes the item as its unit and a reliability pane is written.
			 */
			trials: z.number().int().positive().optional(),
			confidence: z.number().gt(0).lt(1).default(0.95),
			/** For the power note: the smallest effect the design meant to see. */
			minimumDetectableEffect: z.number().positive().optional()
		}),
		/** The campaign ids the design expands to, in order (generated; `expandExperiment` fills it). */
		campaigns: z.array(z.string()).default([])
	})
	.superRefine((experiment, context) => {
		for (const factor of experiment.design.factors) {
			const baseline = experiment.design.baseline[factor.axis];
			if (baseline === undefined) {
				context.addIssue({
					code: 'custom',
					path: ['design', 'baseline', factor.axis],
					message: `the ${factor.axis} factor needs a baseline level`
				});
			} else if (!factor.levels.includes(baseline)) {
				context.addIssue({
					code: 'custom',
					path: ['design', 'baseline', factor.axis],
					message: `the ${factor.axis} baseline '${baseline}' is not one of its levels`
				});
			}
		}
		const metricIds = new Set(experiment.design.metrics.map((metric) => metric.id));
		for (const [index, factor] of experiment.design.factors.entries())
			for (const [level, metricId] of Object.entries(factor.primary ?? {}))
				if (!metricIds.has(metricId))
					context.addIssue({
						code: 'custom',
						path: ['design', 'factors', index, 'primary', level],
						message: `'${metricId}' is not one of the design's metrics`
					});
		const axes = experiment.design.factors.map((factor) => factor.axis);
		if (new Set(axes).size !== axes.length) {
			context.addIssue({
				code: 'custom',
				path: ['design', 'factors'],
				message: 'one factor per axis'
			});
		}
	});
export type Experiment = z.infer<typeof experimentSchema>;

export function parseExperiment(value: unknown): Experiment {
	return experimentSchema.parse(value);
}

/** A knob value as the sweep parses one: a number or a boolean when it is one, else the string. */
export function knobValueOf(text: string): number | string | boolean {
	if (text === 'true') return true;
	if (text === 'false') return false;
	const number = Number(text);
	return text.trim() !== '' && Number.isFinite(number) ? number : text;
}

export type LevelCombination = Partial<Record<ExperimentAxis, string>>;

/** Every combination of the factors' levels, the first factor varying slowest. */
export function levelCombinations(factors: readonly ExperimentFactor[]): LevelCombination[] {
	return factors.reduce<LevelCombination[]>(
		(combinations, factor) =>
			combinations.flatMap((combination) =>
				factor.levels.map((level) => ({ ...combination, [factor.axis]: level }))
			),
		[{}]
	);
}

export function campaignIdFor(experimentId: string, combination: LevelCombination): string {
	const parts = (Object.keys(combination) as ExperimentAxis[])
		.sort()
		.map((axis) => `${axis}=${slugOf(combination[axis] ?? '')}`);
	return `${experimentId}--${parts.join('--')}`;
}

/** The campaign for one level combination: the template with each axis set to its level, the seeds × replicates, one always-passing gate. */
export function campaignFor(experiment: Experiment, combination: LevelCombination): Campaign {
	const { template, factors } = experiment.design;
	let builds = template.builds;
	let guards = template.guards;
	let brains = template.brains;
	let contexts = template.contexts;
	for (const factor of factors) {
		const level = combination[factor.axis];
		if (level === undefined) continue;
		switch (factor.axis) {
			case 'guard': {
				const picked = guards.filter((guard) => guard.id === level);
				// A level naming no template guard is a stack by that id (WP97, `89-…` §4); the runner refuses an unknown one.
				guards = picked.length > 0 ? picked : [{ id: level, fit: [], stack: level }];
				break;
			}
			case 'brain': {
				const picked = brains.filter((brain) => brain.id === level);
				if (picked.length === 0) throw new Error(`no brain '${level}' in the template`);
				brains = picked;
				break;
			}
			case 'context': {
				const named = (contexts ?? []).find((context) => context.id === level);
				if (named) contexts = [named];
				else if ((CONTEXT_LEVELS as readonly string[]).includes(level))
					contexts = [contextSpecFor(level as ContextLevel)];
				else throw new Error(`no context '${level}': a rung or a template context's id`);
				break;
			}
			case 'executors':
				builds = builds.map((build) => ({
					...build,
					overrides: { ...(build.overrides ?? {}), configuration: level }
				}));
				break;
			case 'knob': {
				const knob = factor.knob ?? '';
				builds = builds.map((build) => ({
					...build,
					overrides: {
						...(build.overrides ?? {}),
						knobs: { ...(build.overrides?.knobs ?? {}), [knob]: knobValueOf(level) }
					}
				}));
				break;
			}
		}
	}
	const replicates = experiment.design.replicates;
	const seeds = experiment.design.seeds.flatMap((seed) =>
		Array.from({ length: replicates }, (_, r) => seed * replicates + r)
	);
	const levels = (Object.keys(combination) as ExperimentAxis[])
		.sort()
		.map((axis) => `${axis} = ${combination[axis]}`)
		.join(', ');
	return campaignSchema.parse({
		...template,
		schemaVersion: 1,
		id: campaignIdFor(experiment.id, combination),
		title: `${experiment.title} — ${levels}`,
		builds,
		guards,
		brains,
		...(contexts ? { contexts } : {}),
		seeds,
		...((experiment.design.trials ?? 1) > 1 ? { trials: experiment.design.trials } : {}),
		gates: [
			{
				id: 'a-measurement-not-a-judgment',
				require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0 }
			}
		]
	});
}

/** The design expanded: one campaign per level combination, sharing seeds; the experiment with `campaigns` filled. */
export function expandExperiment(experiment: Experiment): {
	experiment: Experiment;
	campaigns: Campaign[];
} {
	const combinations = levelCombinations(experiment.design.factors);
	const campaigns = combinations.map((combination) => campaignFor(experiment, combination));
	return { experiment: { ...experiment, campaigns: campaigns.map((c) => c.id) }, campaigns };
}

// ---- the analysis ----------------------------------------------------------

const POWER_FLOOR = 30;
const EVENT_FLOOR = 5;

/** A cell's twin on the other side: the same work, the same seed, the same rung. */
const pairKey = (cell: CampaignCell): string =>
	`${cell.item?.id ?? cell.scenario}:${cell.seed}:${cell.context ?? ''}`;

/** The inputs of a cell without its trial: what makes two cells performances of one item. */
const clusterKey = (cell: CampaignCell): string =>
	[
		cell.scenario,
		cell.build,
		cell.guard,
		cell.brain,
		cell.context ?? '',
		cell.item?.id ?? '',
		cell.seed
	].join('|');

/** Whether any cell was one of several performances of its inputs (the campaign asked for `trials`). */
const hasTrials = (cells: readonly CampaignCell[]): boolean =>
	cells.some((cell) => cell.trial !== undefined);

/**
 * **The item as the unit** (WP191): one reading per item — the mean over its trials — in place of one per cell, so `k`
 * trials of a case are one observation of how that case goes and do not inflate `n`. Returns its input when no cell
 * carries a trial, so every earlier result is exactly as it was.
 */
function byItem<T extends { cell: CampaignCell; value: number }>(entries: readonly T[]): T[] {
	if (!hasTrials(entries.map((entry) => entry.cell))) return [...entries];
	const groups = new Map<string, T[]>();
	for (const entry of entries) {
		const key = clusterKey(entry.cell);
		groups.set(key, [...(groups.get(key) ?? []), entry]);
	}
	return [...groups.values()].map((group) => ({
		...group[0]!,
		value: group.reduce((sum, entry) => sum + entry.value, 0) / group.length
	}));
}

/** A binary reading per cell for a rate metric, or `undefined` when the cell was not judged. */
function binaryOf(metric: ExperimentMetric, cell: CampaignCell): boolean | undefined {
	switch (metric.kind) {
		case 'outcome-rate':
			return cell.outcome === undefined ? undefined : cell.outcome === metric.outcome;
		case 'evaluator-pass-rate': {
			const verdict = cell.evaluations[metric.evaluatorId];
			return verdict === undefined || verdict === 'inconclusive' ? undefined : verdict === 'pass';
		}
		case 'assertion-pass-rate':
			return cell.assertions[metric.cardId];
		case 'label-rate': {
			const label = cell.labels[metric.evaluatorId];
			return label === undefined ? undefined : label === metric.label;
		}
		default:
			return undefined;
	}
}

const escalationRateOf = (cell: CampaignCell): number | undefined => {
	const stages = cell.workflow?.stages ?? [];
	if (stages.length === 0) return undefined;
	return stages.filter((stage) => stage.status === 'escalated').length / stages.length;
};

/** A number per cell for a mean metric, or `undefined` when the cell carries none. */
function valueOf(metric: ExperimentMetric, cell: CampaignCell): number | undefined {
	switch (metric.kind) {
		case 'weighted-labels': {
			const label = cell.labels[metric.evaluatorId];
			return label === undefined ? undefined : (metric.weights[label] ?? 0);
		}
		case 'case-metric':
			return cell.caseMetrics[metric.name];
		case 'cost':
			if (metric.of === 'tokens') return cell.metrics.tokensIn + cell.metrics.tokensOut;
			if (metric.of === 'approvals') return cell.metrics.approvalsRequested;
			if (metric.of === 'touches') return cell.workflow?.touches.length;
			if (metric.of === 'breaches')
				return cell.workflow ? (cell.workflow.breaches > 0 ? 1 : 0) : undefined;
			return escalationRateOf(cell);
		default:
			return undefined;
	}
}

const mean = (values: readonly number[]): number =>
	values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

function costOf(
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	rates?: BillRates
) {
	const tokens = (cells: readonly CampaignCell[]) =>
		mean(cells.map((cell) => cell.metrics.tokensIn + cell.metrics.tokensOut));
	const approvals = (cells: readonly CampaignCell[]) =>
		mean(cells.map((cell) => cell.metrics.approvalsRequested));
	const escalations = (cells: readonly CampaignCell[]) =>
		mean(
			cells.flatMap((cell) => {
				const rate = escalationRateOf(cell);
				return rate === undefined ? [] : [rate];
			})
		);
	const touches = (cells: readonly CampaignCell[]) =>
		cells.flatMap((cell) => (cell.workflow ? [cell.workflow.touches.length] : []));
	const breaches = (cells: readonly CampaignCell[]) =>
		cells.flatMap((cell) => (cell.workflow ? [cell.workflow.breaches > 0 ? 1 : 0] : []));
	const withWorkflow = touches(baseline).length > 0 && touches(treatment).length > 0;
	return {
		tokensPerCase: { baseline: tokens(baseline), treatment: tokens(treatment) },
		approvalsPerCase: { baseline: approvals(baseline), treatment: approvals(treatment) },
		escalationRate: { baseline: escalations(baseline), treatment: escalations(treatment) },
		...(rates
			? { bill: { baseline: billOf(baseline, rates), treatment: billOf(treatment, rates) } }
			: {}),
		...(withWorkflow
			? {
					touchesPerCase: {
						baseline: mean(touches(baseline)),
						treatment: mean(touches(treatment))
					},
					breachRate: { baseline: mean(breaches(baseline)), treatment: mean(breaches(treatment)) }
				}
			: {})
	};
}

interface Difference {
	baseline: EffectRecord['baseline'];
	treatment: EffectRecord['treatment'];
	delta: number;
	interval: [number, number];
	p?: number | undefined;
	method: string;
	underpowered: boolean;
}

/**
 * **A difference of rates over items** (WP191): each item's reading is its pass fraction over its trials; each side's
 * value is the mean over items, its interval over items (Wilson when every item reads 0 or 1, else a seeded bootstrap);
 * the difference's interval is Welch over item readings; the test is the sign test over the paired items whose
 * readings differ. The trials are in the readings, not the `n`.
 */
function clusteredRateDifference(
	metric: ExperimentMetric,
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	confidence: number
): Difference {
	const judged = (cells: readonly CampaignCell[]) =>
		byItem(
			cells.flatMap((cell) => {
				const reading = binaryOf(metric, cell);
				return reading === undefined ? [] : [{ cell, value: reading ? 1 : 0 }];
			})
		);
	const b = judged(baseline);
	const t = judged(treatment);
	const bv = b.map((entry) => entry.value);
	const tv = t.map((entry) => entry.value);
	const w = welch(tv, bv, confidence);
	const byKey = new Map(b.map((entry) => [pairKey(entry.cell), entry.value]));
	let paired = 0;
	let differing = 0;
	let up = 0;
	for (const entry of t) {
		const twin = byKey.get(pairKey(entry.cell));
		if (twin === undefined) continue;
		paired += 1;
		if (entry.value !== twin) {
			differing += 1;
			if (entry.value > twin) up += 1;
		}
	}
	const side = (values: readonly number[]): EffectRecord['baseline'] => {
		const estimate = itemEstimate(values, { confidence });
		return { value: estimate.value, n: values.length, interval: estimate.interval };
	};
	const trialsPerItem = Math.max(
		1,
		...[...baseline, ...treatment].map((cell) => (cell.trial ?? 0) + 1)
	);
	const cappedInterval: [number, number] = [
		Math.max(-1, w.interval[0]),
		Math.min(1, w.interval[1])
	];
	return {
		baseline: side(bv),
		treatment: side(tv),
		delta: w.delta,
		interval: cappedInterval,
		...(paired > 0 ? { p: signTest(up, differing).p } : {}),
		method: `difference of rates over items (${trialsPerItem} trials each, the item the unit), Welch interval at ${Math.round(confidence * 100)}%${paired > 0 ? `; sign test over ${differing} differing of ${paired} paired items` : ''}`,
		underpowered: bv.length < POWER_FLOOR || tv.length < POWER_FLOOR
	};
}

function rateDifference(
	metric: ExperimentMetric,
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	confidence: number
): Difference {
	if (hasTrials(baseline) || hasTrials(treatment))
		return clusteredRateDifference(metric, baseline, treatment, confidence);
	const judged = (cells: readonly CampaignCell[]) =>
		cells.flatMap((cell) => {
			const reading = binaryOf(metric, cell);
			return reading === undefined ? [] : [{ cell, reading }];
		});
	const b = judged(baseline);
	const t = judged(treatment);
	const kb = b.filter((entry) => entry.reading).length;
	const kt = t.filter((entry) => entry.reading).length;
	const pb = b.length === 0 ? 0 : kb / b.length;
	const pt = t.length === 0 ? 0 : kt / t.length;
	const interval = newcombe(kt, t.length, kb, b.length, confidence);
	// Pairs: the same work on both sides; the sign test over the discordant ones.
	const byKey = new Map(b.map((entry) => [pairKey(entry.cell), entry.reading]));
	let discordant = 0;
	let up = 0;
	let paired = 0;
	for (const entry of t) {
		const twin = byKey.get(pairKey(entry.cell));
		if (twin === undefined) continue;
		paired += 1;
		if (twin !== entry.reading) {
			discordant += 1;
			if (entry.reading) up += 1;
		}
	}
	const test =
		paired > 0
			? {
					p: signTest(up, discordant).p,
					name: `sign test over ${discordant} discordant of ${paired} pairs`
				}
			: { p: twoProportionZ(kt, t.length, kb, b.length).p, name: 'two-proportion z (unpaired)' };
	return {
		baseline: {
			value: pb,
			n: b.length,
			interval: [...wilson(kb, b.length, confidence)] as [number, number]
		},
		treatment: {
			value: pt,
			n: t.length,
			interval: [...wilson(kt, t.length, confidence)] as [number, number]
		},
		delta: pt - pb,
		interval: [interval[0], interval[1]],
		p: test.p,
		method: `difference of rates, Newcombe interval at ${Math.round(confidence * 100)}%; ${test.name}`,
		underpowered:
			b.length < POWER_FLOOR ||
			t.length < POWER_FLOOR ||
			Math.min(kb, b.length - kb, kt, t.length - kt) < EVENT_FLOOR
	};
}

function meanDifference(
	metric: ExperimentMetric,
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	confidence: number
): Difference {
	const valued = (cells: readonly CampaignCell[]) =>
		cells.flatMap((cell) => {
			const value = valueOf(metric, cell);
			return value === undefined ? [] : [{ cell, value }];
		});
	const b = byItem(valued(baseline));
	const t = byItem(valued(treatment));
	const bv = b.map((entry) => entry.value);
	const tv = t.map((entry) => entry.value);
	const w = welch(tv, bv, confidence);
	const byKey = new Map(b.map((entry) => [pairKey(entry.cell), entry.value]));
	let paired = 0;
	let nonzero = 0;
	let up = 0;
	for (const entry of t) {
		const twin = byKey.get(pairKey(entry.cell));
		if (twin === undefined) continue;
		paired += 1;
		if (entry.value !== twin) {
			nonzero += 1;
			if (entry.value > twin) up += 1;
		}
	}
	const side = (values: readonly number[]): EffectRecord['baseline'] => {
		const s = summarise(values);
		const half = s.n < 2 ? 0 : (zFor(confidence) * s.sd) / Math.sqrt(s.n);
		return { value: s.mean, n: s.n, interval: [s.mean - half, s.mean + half] };
	};
	return {
		baseline: side(bv),
		treatment: side(tv),
		delta: w.delta,
		interval: [w.interval[0], w.interval[1]],
		...(paired > 0 ? { p: signTest(up, nonzero).p } : {}),
		method: `difference of means, Welch interval at ${Math.round(confidence * 100)}%${paired > 0 ? `; sign test over ${nonzero} non-tied of ${paired} pairs` : ''}`,
		underpowered: bv.length < POWER_FLOOR || tv.length < POWER_FLOOR
	};
}

function decidedCases(
	cells: readonly CampaignCell[],
	across: string,
	stratify?: string
): DecidedCase[] {
	return cells.flatMap((cell) => {
		const group = cell.cohort?.[across];
		if (group === undefined || !cell.decision) return [];
		return [
			{
				group,
				decision: cell.decision.outcome,
				verdict: cell.decision.verdict,
				repaid: cell.decision.repaid,
				stratum: stratify !== undefined ? cell.cohort?.[stratify] : undefined
			}
		];
	});
}

function fairnessDifference(
	metric: Extract<ExperimentMetric, { kind: 'fairness' }>,
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	confidence: number
): Difference | undefined {
	const b = decidedCases(baseline, metric.across, metric.stratify);
	const t = decidedCases(treatment, metric.across, metric.stratify);
	if (b.length === 0 || t.length === 0) return undefined;
	const options = {
		confidence,
		...(metric.stratify !== undefined ? { stratify: 'stratum' as const } : {})
	};
	const rb = fairnessMetric(
		metric.metric as Exclude<FairnessMetricId, 'counterfactual-flip'>,
		b,
		options
	);
	const rt = fairnessMetric(
		metric.metric as Exclude<FairnessMetricId, 'counterfactual-flip'>,
		t,
		options
	);
	return {
		baseline: { value: rb.value, n: b.length, interval: [rb.interval[0], rb.interval[1]] },
		treatment: { value: rt.value, n: t.length, interval: [rt.interval[0], rt.interval[1]] },
		delta: rt.value - rb.value,
		interval: [rt.interval[0] - rb.interval[1], rt.interval[1] - rb.interval[0]],
		method: `difference of ${metric.metric} across ${metric.across}; the two sides' intervals combined conservatively, no test`,
		underpowered: rb.underpowered || rt.underpowered
	};
}

function differenceOf(
	metric: ExperimentMetric,
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	confidence: number
): Difference | undefined {
	switch (metric.kind) {
		case 'outcome-rate':
		case 'evaluator-pass-rate':
		case 'assertion-pass-rate':
		case 'label-rate':
			return rateDifference(metric, baseline, treatment, confidence);
		case 'case-metric':
		case 'weighted-labels':
		case 'cost':
			return meanDifference(metric, baseline, treatment, confidence);
		case 'fairness':
			return fairnessDifference(metric, baseline, treatment, confidence);
	}
}

function slicesOf(
	metric: ExperimentMetric,
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	confidence: number
): EffectRecord['slices'] {
	if (metric.kind === 'fairness') return undefined;
	const attributes = [
		...new Set([...baseline, ...treatment].flatMap((cell) => Object.keys(cell.cohort ?? {})))
	].sort();
	const slices: NonNullable<EffectRecord['slices']> = [];
	for (const attribute of attributes) {
		const values = [
			...new Set(
				[...baseline, ...treatment].flatMap((cell) => {
					const value = cell.cohort?.[attribute];
					return value === undefined ? [] : [value];
				})
			)
		].sort();
		for (const value of values) {
			const b = baseline.filter((cell) => cell.cohort?.[attribute] === value);
			const t = treatment.filter((cell) => cell.cohort?.[attribute] === value);
			if (b.length === 0 || t.length === 0) continue;
			const difference = differenceOf(metric, b, t, confidence);
			if (!difference) continue;
			slices.push({
				where: { [attribute]: value },
				delta: difference.delta,
				interval: difference.interval,
				n: { baseline: difference.baseline.n, treatment: difference.treatment.n }
			});
		}
	}
	// WP153 (`111-…` §4): a slice per scenario when a design runs several, so an attack carried by one is read undiluted.
	const scenarios = [...new Set([...baseline, ...treatment].map((cell) => cell.scenario))].sort();
	if (scenarios.length > 1)
		for (const scenario of scenarios) {
			const b = baseline.filter((cell) => cell.scenario === scenario);
			const t = treatment.filter((cell) => cell.scenario === scenario);
			if (b.length === 0 || t.length === 0) continue;
			const difference = differenceOf(metric, b, t, confidence);
			if (!difference) continue;
			slices.push({
				where: { scenario },
				delta: difference.delta,
				interval: difference.interval,
				n: { baseline: difference.baseline.n, treatment: difference.treatment.n }
			});
		}
	return slices.length === 0 ? undefined : slices;
}

/** Whether an effect's interval excludes zero in the metric's good direction (`+1`), the bad one (`−1`), or neither (`0`). */
export function effectSign(
	effect: Pick<EffectRecord, 'interval'>,
	metricDirection: 'lower-is-better' | 'higher-is-better'
): -1 | 0 | 1 {
	const [lo, hi] = effect.interval;
	if (lo > 0) return metricDirection === 'higher-is-better' ? 1 : -1;
	if (hi < 0) return metricDirection === 'lower-is-better' ? 1 : -1;
	return 0;
}

/**
 * Both sides at a bound with nothing between them (WP116, `103-…` §6): a rate
 * at 0 or 1 on both sides, or a mean with no spread on either side and the
 * same value — a comparison no control could have moved.
 */
export function isUntestable(
	metric: Pick<ExperimentMetric, 'kind'>,
	baseline: EffectRecord['baseline'],
	treatment: EffectRecord['treatment']
): boolean {
	if (baseline.value !== treatment.value) return false;
	const rate =
		metric.kind === 'outcome-rate' ||
		metric.kind === 'evaluator-pass-rate' ||
		metric.kind === 'assertion-pass-rate' ||
		metric.kind === 'label-rate';
	if (rate) return baseline.value === 0 || baseline.value === 1;
	const flat = (side: EffectRecord['baseline']) => side.interval[0] === side.interval[1];
	return flat(baseline) && flat(treatment);
}

/** The verdict rule (`72-…` §2): supported when every effect's interval excludes zero the right way; not-supported when one excludes it the wrong way; inconclusive otherwise; untestable (WP116) when every effect sat at a bound. */
export function verdictOf(
	effects: ReadonlyArray<Pick<EffectRecord, 'interval' | 'metricId' | 'untestable'>>,
	metrics: ReadonlyArray<Pick<ExperimentMetric, 'id' | 'direction'>>
): ExperimentVerdict {
	if (effects.length === 0) return 'inconclusive';
	// An effect at a bound says nothing about the control (WP116): it leaves the verdict, and all of them leave it untestable.
	const testable = effects.filter((effect) => effect.untestable !== true);
	if (testable.length === 0) return 'untestable';
	const signs = testable.map((effect) => {
		const metric = metrics.find((entry) => entry.id === effect.metricId);
		return metric ? effectSign(effect, metric.direction) : 0;
	});
	if (signs.some((sign) => sign === -1)) return 'not-supported';
	if (signs.every((sign) => sign === 1)) return 'supported';
	return 'inconclusive';
}

/** The minimum detectable difference of rates at 80% power for the smallest side: (z₁₋α/₂ + z₀.₈)·√(2·p̄(1−p̄)/n). */
export function minimumDetectableRateDifference(
	pooled: number,
	n: number,
	confidence: number
): number {
	if (n <= 0) return 1;
	const zPower = 0.8416;
	return (zFor(confidence) + zPower) * Math.sqrt((2 * pooled * (1 - pooled)) / n);
}

export interface AnalyseOptions {
	ranAt: string;
	populationDigest?: string | undefined;
	/** The stacks the guard factor's levels may name (WP97): a stack's `controls` join the effect's, so the register shows its effect on the control's row. */
	stacks?: readonly Stack[];
	/** The rates the bill is read at (WP172); absent, the effects carry no bill. */
	bill?: BillRates | undefined;
}

/** What a token and a person's minute cost, as the calibration table states them (WP172). */
export interface BillRates {
	poundsPerThousandTokens: number;
	humanPoundsPerHour: number;
}

/** The rates the bank states (`fs-bank/bill`), read from whichever tables are installed; none, no bill. */
export function billRatesFrom(
	tables: readonly CalibrationTable[],
	kind: 'hosted' | 'local' = 'hosted'
): BillRates | undefined {
	const bill = tables.find((table) => table.id === 'fs-bank/bill');
	if (!bill) return undefined;
	const price = calibrationRow(bill, 'model-pounds-per-thousand-tokens').distribution[kind];
	const hourly = calibrationRow(bill, 'human-pounds-per-hour').distribution['case-handler'];
	return price === undefined || hourly === undefined
		? undefined
		: { poundsPerThousandTokens: price, humanPoundsPerHour: hourly };
}

/** The bill per case over a side's cells: tokens priced at the model's rate, the reviewer's seconds at the person's. */
export function billOf(cells: readonly CampaignCell[], rates: BillRates): Bill {
	const tokens = mean(cells.map((cell) => cell.metrics.tokensIn + cell.metrics.tokensOut));
	const humanSeconds = mean(
		cells.map((cell) => (cell.workflow?.reviews ?? []).reduce((sum, r) => sum + r.seconds, 0))
	);
	const modelPounds = (tokens / 1000) * rates.poundsPerThousandTokens;
	const humanPounds = (humanSeconds / 3600) * rates.humanPoundsPerHour;
	return { tokens, modelPounds, humanSeconds, humanPounds, pounds: modelPounds + humanPounds };
}

/** The reports folded into effects: for each metric and each factor, every treatment level against the baseline with the other axes at baseline. */
/** The binary metrics of a design: those a cell passes or fails. */
const binaryMetrics = (experiment: Experiment): ExperimentMetric[] =>
	experiment.design.metrics.filter(
		(metric) =>
			metric.kind === 'outcome-rate' ||
			metric.kind === 'evaluator-pass-rate' ||
			metric.kind === 'assertion-pass-rate' ||
			metric.kind === 'label-rate'
	);

/** The `k` of pass@k and pass^k for a design: the trials asked of each item, at most three (`113-…` D2). */
const reliabilityK = (trials: number): number => Math.min(Math.max(trials, 1), 3);

/** Cells grouped into items: the performances of one case. */
function itemsOf(cells: readonly CampaignCell[]): CampaignCell[][] {
	const groups = new Map<string, CampaignCell[]>();
	for (const cell of cells) {
		const key = clusterKey(cell);
		groups.set(key, [...(groups.get(key) ?? []), cell]);
	}
	return [...groups.values()];
}

/**
 * **One campaign's reliability** (WP191, `113-RECORDING-AND-RELIABILITY.md` §4.7): pass@1, pass@k, pass^k and consistency
 * for each binary metric, with intervals over items; across each item's trials, how often the first call and the first
 * words repeated (the prompt at the first tick was the same, so a difference is the model's own) and how soon and how far
 * the paths forked. `undefined` when no cell was performed more than once.
 */
export function reliabilityOf(
	experiment: Experiment,
	report: CampaignReport
): ReliabilityRecord | undefined {
	if (!hasTrials(report.cells)) return undefined;
	const confidence = experiment.design.confidence;
	const items = itemsOf(report.cells);
	const trials = Math.max(experiment.design.trials ?? 1, ...items.map((item) => item.length));
	const k = reliabilityK(trials);
	let counted = 0;
	let skipped = 0;
	const metrics = binaryMetrics(experiment).map((metric) => {
		const per = items.map((item) => {
			const readings = item.flatMap((cell) => {
				const reading = binaryOf(metric, cell);
				return reading === undefined ? [] : [reading];
			});
			return { passes: readings.filter(Boolean).length, trials: readings.length };
		});
		const result = itemReliability(per, k, { confidence });
		counted = result.items;
		skipped = result.skipped;
		return {
			metricId: metric.id,
			pass1: result.pass1,
			passAtK: result.passAtK,
			passHatK: result.passHatK,
			consistency: result.consistency
		};
	});

	// First tick and divergence, over every pair of trials of an item.
	const sameCall: number[] = [];
	const sameWords: number[] = [];
	const identical: number[] = [];
	const firsts: number[] = [];
	const distances: number[] = [];
	let pairs = 0;
	for (const item of items) {
		const paths = item.flatMap((cell) => (cell.path ? [cell.path] : []));
		if (paths.length < 2) continue;
		let itemSameCall = 0;
		let itemSameWords = 0;
		let itemPairs = 0;
		let allSame = true;
		for (let i = 0; i < paths.length; i += 1)
			for (let j = i + 1; j < paths.length; j += 1) {
				itemPairs += 1;
				if (paths[i]!.first?.call === paths[j]!.first?.call) itemSameCall += 1;
				if (paths[i]!.first?.words === paths[j]!.first?.words) itemSameWords += 1;
				const forked = firstDivergence(paths[i]!.calls, paths[j]!.calls);
				if (forked !== undefined) {
					allSame = false;
					firsts.push(forked);
				}
				distances.push(pathDistance(paths[i]!.calls, paths[j]!.calls));
			}
		pairs += itemPairs;
		sameCall.push(itemSameCall / itemPairs);
		sameWords.push(itemSameWords / itemPairs);
		identical.push(allSame ? 1 : 0);
	}
	const median = (values: number[]): number | null => {
		if (values.length === 0) return null;
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
	};
	return {
		campaignId: report.campaignId,
		trials,
		k,
		items: counted,
		skipped,
		metrics,
		...(pairs > 0
			? {
					firstTick: {
						pairs,
						sameCall: itemEstimate(sameCall, { confidence }),
						sameWords: itemEstimate(sameWords, { confidence })
					},
					divergence: {
						identicalPaths: itemEstimate(identical, { confidence }),
						medianFirstDivergence: median(firsts),
						meanPathDistance: distances.length === 0 ? 0 : mean(distances)
					}
				}
			: {})
	};
}

/** One side's pass^k for a binary metric, for the effect that carries it. */
function sideReliability(
	metric: ExperimentMetric,
	cells: readonly CampaignCell[],
	experiment: Experiment
): ReturnType<typeof itemReliability>['passHatK'] | undefined {
	if (!hasTrials(cells) || !binaryMetrics(experiment).some((held) => held.id === metric.id))
		return undefined;
	const trials = Math.max(experiment.design.trials ?? 1, ...itemsOf(cells).map((i) => i.length));
	const per = itemsOf(cells).map((item) => {
		const readings = item.flatMap((cell) => {
			const reading = binaryOf(metric, cell);
			return reading === undefined ? [] : [reading];
		});
		return { passes: readings.filter(Boolean).length, trials: readings.length };
	});
	return itemReliability(per, reliabilityK(trials), { confidence: experiment.design.confidence })
		.passHatK;
}

export function analyseExperiment(
	experiment: Experiment,
	reports: readonly CampaignReport[],
	options: AnalyseOptions
): ExperimentResult {
	const { design } = experiment;
	const byId = new Map(reports.map((report) => [report.campaignId, report]));
	const baselineCombination: LevelCombination = {};
	for (const factor of design.factors) {
		baselineCombination[factor.axis] = design.baseline[factor.axis] ?? factor.levels[0] ?? '';
	}
	const rootBaseline = byId.get(campaignIdFor(experiment.id, baselineCombination));
	const effects: EffectRecord[] = [];
	const notes: string[] = [];
	let smallestSide = Number.POSITIVE_INFINITY;
	let pooledRate: number | undefined;
	if (!rootBaseline) {
		notes.push(
			`the baseline campaign (${campaignIdFor(experiment.id, baselineCombination)}) has no report`
		);
	}
	// The brain axis is the tier (WP116, `103-…` §6): every other factor is measured under each of its levels, and brains are never compared as if a brain were a control.
	const brainFactor = design.factors.find((factor) => factor.axis === 'brain');
	const tierOf = (brainId: string | undefined): string => {
		const brains = design.template.brains;
		const named = brainId === undefined ? brains : brains.filter((brain) => brain.id === brainId);
		return named.map((brain) => brain.tier).join('+') || 'unknown';
	};
	const tiers: Array<string | undefined> = brainFactor ? [...brainFactor.levels] : [undefined];
	for (const factor of design.factors) {
		if (factor.axis === 'brain') continue;
		const baselineLevel = baselineCombination[factor.axis] ?? '';
		for (const brainLevel of tiers) {
			const underTier =
				brainLevel === undefined
					? baselineCombination
					: { ...baselineCombination, brain: brainLevel };
			const baselineReport = byId.get(campaignIdFor(experiment.id, underTier));
			const tier = tierOf(brainLevel);
			for (const level of factor.levels) {
				if (level === baselineLevel) continue;
				const combination = { ...underTier, [factor.axis]: level };
				const treatmentReport = byId.get(campaignIdFor(experiment.id, combination));
				if (!baselineReport || !treatmentReport) {
					if (!treatmentReport)
						notes.push(`${campaignIdFor(experiment.id, combination)} has no report`);
					continue;
				}
				const primary = factor.primary?.[level];
				const metrics =
					primary === undefined
						? design.metrics
						: [
								...design.metrics.filter((metric) => metric.id === primary),
								...design.metrics.filter((metric) => metric.id !== primary)
							];
				for (const metric of metrics) {
					const difference = differenceOf(
						metric,
						baselineReport.cells,
						treatmentReport.cells,
						design.confidence
					);
					if (!difference) {
						notes.push(
							`${metric.id}: no reading for ${factor.axis} = ${level} (no decided cells on a side)`
						);
						continue;
					}
					smallestSide = Math.min(smallestSide, difference.baseline.n, difference.treatment.n);
					if (
						metric.kind !== 'case-metric' &&
						metric.kind !== 'cost' &&
						metric.kind !== 'fairness'
					) {
						const n = difference.baseline.n + difference.treatment.n;
						const pooled =
							n === 0
								? 0
								: (difference.baseline.value * difference.baseline.n +
										difference.treatment.value * difference.treatment.n) /
									n;
						pooledRate = pooledRate === undefined ? pooled : (pooledRate + pooled) / 2;
					}
					const slices = slicesOf(
						metric,
						baselineReport.cells,
						treatmentReport.cells,
						design.confidence
					);
					effects.push({
						experimentId: experiment.id,
						metricId: metric.id,
						controlIds: [
							...new Set([
								...experiment.controls,
								...stackControlsFor(experiment, options.stacks, factor.axis, level),
								...(factor.controls?.[level] ?? [])
							])
						],
						factor: { axis: factor.axis, baseline: baselineLevel, treatment: level },
						baseline: difference.baseline,
						treatment: difference.treatment,
						delta: difference.delta,
						interval: difference.interval,
						...(difference.p !== undefined ? { p: difference.p } : {}),
						method: difference.method,
						underpowered: difference.underpowered,
						tier,
						...(isUntestable(metric, difference.baseline, difference.treatment)
							? { untestable: true as const }
							: {}),
						...(slices ? { slices } : {}),
						cost: costOf(baselineReport.cells, treatmentReport.cells, options.bill),
						...(() => {
							const b = sideReliability(metric, baselineReport.cells, experiment);
							const t = sideReliability(metric, treatmentReport.cells, experiment);
							const trials = Math.max(
								experiment.design.trials ?? 1,
								...itemsOf(baselineReport.cells).map((item) => item.length)
							);
							return b && t
								? { reliability: { k: reliabilityK(trials), baseline: b, treatment: t } }
								: {};
						})(),
						runIds: [...baselineReport.cells, ...treatmentReport.cells].flatMap((cell) =>
							cell.runId ? [cell.runId] : []
						),
						reportIds: [baselineReport.id, treatmentReport.id]
					});
				}
			}
		}
	}
	const verdict = verdictOf(effects, design.metrics);
	if (Number.isFinite(smallestSide) && pooledRate !== undefined) {
		const mde = minimumDetectableRateDifference(pooledRate, smallestSide, design.confidence);
		notes.unshift(
			`minimum detectable difference of rates at the achieved n (${smallestSide} on the smaller side, 80% power): ${(mde * 100).toFixed(1)} points${design.minimumDetectableEffect !== undefined ? ` against the ${(design.minimumDetectableEffect * 100).toFixed(1)} the design meant to see` : ''}`
		);
	}
	if (effects.some((effect) => effect.underpowered)) {
		notes.push(
			'one or more effects are underpowered (fewer than 30 cells on a side, or fewer than 5 events either way)'
		);
	}
	const body: Omit<ExperimentResult, 'digest'> = {
		schemaVersion: 1,
		id: `${experiment.id}@${options.ranAt}`,
		experimentId: experiment.id,
		title: experiment.title,
		hypothesis: experiment.hypothesis,
		controls: [...experiment.controls],
		obligations: [...experiment.obligations],
		ranAt: options.ranAt,
		...(options.populationDigest !== undefined
			? { populationDigest: options.populationDigest }
			: {}),
		...(design.template.source ? { workflowIds: [design.template.source.workflowId] } : {}),
		campaignIds: experiment.campaigns.length > 0 ? [...experiment.campaigns] : [...byId.keys()],
		effects,
		...(() => {
			const reliability = reports.flatMap((report) => {
				const held = reliabilityOf(experiment, report);
				return held ? [held] : [];
			});
			return reliability.length > 0 ? { reliability } : {};
		})(),
		verdict,
		note: notes.join('; ')
	};
	return { ...body, digest: experimentResultDigest(body) };
}

// ---- the rendering ---------------------------------------------------------

const points = (value: number): string => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}`;
const fixed = (value: number): string =>
	Math.abs(value) < 10 ? value.toFixed(3) : value.toFixed(1);

/** The result as markdown: the hypothesis, the verdict and the note, one table per metric. */
export function renderExperimentMarkdown(result: ExperimentResult): string {
	const lines: string[] = [
		`# ${result.title}`,
		'',
		`**Hypothesis.** ${result.hypothesis}`,
		'',
		`**Verdict: ${result.verdict}.** ${result.note}`,
		'',
		`Ran ${result.ranAt}; controls ${result.controls.join(', ') || '—'}; obligations ${result.obligations.join(', ') || '—'}; campaigns ${result.campaignIds.join(', ')}. Evidence about this synthetic bank under these configurations, and nothing else.`,
		''
	];
	const metricIds = [...new Set(result.effects.map((effect) => effect.metricId))];
	for (const metricId of metricIds) {
		lines.push(`## ${metricId}`, '');
		lines.push(
			'| Factor | Treatment vs baseline | Baseline | Treatment | Δ | Interval | p | n | Power |'
		);
		lines.push('|---|---|---|---|---|---|---|---|---|');
		for (const effect of result.effects.filter((entry) => entry.metricId === metricId)) {
			const rate = effect.method.startsWith('difference of rates');
			const show = rate ? points : fixed;
			lines.push(
				`| ${effect.factor.axis} | ${effect.factor.treatment} vs ${effect.factor.baseline} | ${show(effect.baseline.value)} | ${show(effect.treatment.value)} | ${show(effect.delta)} | ${show(effect.interval[0])} – ${show(effect.interval[1])} | ${effect.p === undefined ? '—' : effect.p.toFixed(3)} | ${effect.baseline.n} / ${effect.treatment.n} | ${effect.underpowered ? 'underpowered' : 'ok'} |`
			);
		}
		lines.push('');
		const first = result.effects.find((entry) => entry.metricId === metricId);
		if (first) lines.push(`Method: ${first.method}.`, '');
	}
	lines.push(...reliabilityLines(result));
	lines.push(...billLines(result));
	lines.push(`Digest \`${result.digest}\`.`, '');
	return lines.join('\n');
}

/** Reliability over trials, one table per campaign that was performed more than once (WP191); nothing otherwise. */
function reliabilityLines(result: ExperimentResult): string[] {
	if (!result.reliability || result.reliability.length === 0) return [];
	const pc = (value: number) => `${(value * 100).toFixed(0)}%`;
	const est = (e: { value: number; interval: [number, number] }) =>
		`${pc(e.value)} (${pc(e.interval[0])}–${pc(e.interval[1])})`;
	const lines = [
		'## Reliability over trials',
		'',
		'Each item is a case performed more than once with fresh model draws; every figure is over items, never trials, so repeating a case does not inflate *n*. **pass^k** (every k performances pass) is the reliability figure for a control; **pass@k** (some performance passes) is capability.',
		''
	];
	for (const record of result.reliability) {
		lines.push(
			`### ${record.campaignId}`,
			'',
			`${record.items} items, ${record.trials} trials each, k = ${record.k}${record.skipped > 0 ? `; ${record.skipped} items had fewer than k trials and are left out` : ''}.`,
			'',
			'| Metric | pass@1 | pass@k | pass^k | Consistency |',
			'|---|---|---|---|---|'
		);
		for (const metric of record.metrics)
			lines.push(
				`| ${metric.metricId} | ${est(metric.pass1)} | ${est(metric.passAtK)} | ${est(metric.passHatK)} | ${est(metric.consistency)} |`
			);
		lines.push('');
		if (record.firstTick && record.divergence) {
			lines.push(
				`At the first tick the prompt was identical across trials, so a difference is the model's own: the same call in ${est(record.firstTick.sameCall)} of ${record.firstTick.pairs} pairs, the same words in ${est(record.firstTick.sameWords)}. Over the whole journey ${est(record.divergence.identicalPaths)} of items took one path in every trial; where trials forked, the median first difference was at call ${record.divergence.medianFirstDivergence ?? '—'}, and two trials' action sequences were ${record.divergence.meanPathDistance.toFixed(1)} edits apart on average.`,
				''
			);
		}
	}
	return lines;
}

/** The bill per case as a table, one row per distinct effect (WP172); nothing when the analysis priced nothing. */
function billLines(result: ExperimentResult): string[] {
	const billed = result.effects.filter((effect) => effect.cost.bill !== undefined);
	if (billed.length === 0) return [];
	const lines = [
		'## Bill per case',
		'',
		'| Factor | Treatment vs baseline | Baseline £ | Treatment £ | Model £ (treatment) | People £ (treatment) |',
		'|---|---|---|---|---|---|'
	];
	const seen = new Set<string>();
	for (const effect of billed) {
		const bill = effect.cost.bill!;
		const key = `${effect.factor.axis}|${effect.factor.treatment}|${effect.tier ?? ''}|${bill.baseline.pounds}|${bill.treatment.pounds}`;
		if (seen.has(key)) continue;
		seen.add(key);
		const tier = effect.tier ? ` (${effect.tier} tier)` : '';
		lines.push(
			`| ${effect.factor.axis} | ${effect.factor.treatment} vs ${effect.factor.baseline}${tier} | ${bill.baseline.pounds.toFixed(4)} | ${bill.treatment.pounds.toFixed(4)} | ${bill.treatment.modelPounds.toFixed(4)} | ${bill.treatment.humanPounds.toFixed(4)} |`
		);
	}
	lines.push(
		'',
		'Pounds at the stated rates (`fs-bank/bill`, assumptions): tokens at the hosted price, reviewer seconds at the case handler’s hourly cost.',
		''
	);
	return lines;
}

/**
 * The controls a guard level's stack claims (WP97, `89-…` §6), joined to that
 * level's effects. A level names a stack by its id, or (WP150) is a template
 * guard whose `stack` names one. Per level since WP157: before, every stack the
 * factor named joined every effect, which no design with one stack level showed.
 */
function stackControlsFor(
	experiment: Experiment,
	stacks: readonly Stack[] | undefined,
	axis: string,
	level: string
): string[] {
	if (!stacks || stacks.length === 0 || axis !== 'guard') return [];
	const guard = experiment.design.template.guards.find((each) => each.id === level);
	const stackId = guard?.stack ?? level;
	return stacks.find((stack) => stack.id === stackId)?.controls ?? [];
}
