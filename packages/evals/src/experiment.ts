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
	newcombe,
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
		knob: z.string().min(1).optional()
	})
	.refine((factor) => factor.axis !== 'knob' || factor.knob !== undefined, {
		message: 'a knob factor names its knob'
	});
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
	z.object({
		kind: z.literal('label-rate'),
		...metricBase,
		evaluatorId: z.string().min(1),
		label: z.string().min(1)
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
				if (picked.length === 0) throw new Error(`no guard '${level}' in the template`);
				guards = picked;
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

/** A binary reading per cell for a rate metric, or `undefined` when the cell was not judged. */
function binaryOf(metric: ExperimentMetric, cell: CampaignCell): boolean | undefined {
	switch (metric.kind) {
		case 'outcome-rate':
			return cell.outcome === undefined ? undefined : cell.outcome === metric.outcome;
		case 'evaluator-pass-rate': {
			const verdict = cell.evaluations[metric.evaluatorId];
			return verdict === undefined || verdict === 'inconclusive' ? undefined : verdict === 'pass';
		}
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

function costOf(baseline: readonly CampaignCell[], treatment: readonly CampaignCell[]) {
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

function rateDifference(
	metric: ExperimentMetric,
	baseline: readonly CampaignCell[],
	treatment: readonly CampaignCell[],
	confidence: number
): Difference {
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
	const b = valued(baseline);
	const t = valued(treatment);
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
		case 'label-rate':
			return rateDifference(metric, baseline, treatment, confidence);
		case 'case-metric':
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

/** The verdict rule (`72-…` §2): supported when every effect's interval excludes zero the right way; not-supported when one excludes it the wrong way; inconclusive otherwise. */
export function verdictOf(
	effects: ReadonlyArray<Pick<EffectRecord, 'interval' | 'metricId'>>,
	metrics: ReadonlyArray<Pick<ExperimentMetric, 'id' | 'direction'>>
): ExperimentVerdict {
	if (effects.length === 0) return 'inconclusive';
	const signs = effects.map((effect) => {
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
}

/** The reports folded into effects: for each metric and each factor, every treatment level against the baseline with the other axes at baseline. */
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
	const baselineReport = byId.get(campaignIdFor(experiment.id, baselineCombination));
	const effects: EffectRecord[] = [];
	const notes: string[] = [];
	let smallestSide = Number.POSITIVE_INFINITY;
	let pooledRate: number | undefined;
	if (!baselineReport) {
		notes.push(
			`the baseline campaign (${campaignIdFor(experiment.id, baselineCombination)}) has no report`
		);
	}
	for (const factor of design.factors) {
		const baselineLevel = baselineCombination[factor.axis] ?? '';
		for (const level of factor.levels) {
			if (level === baselineLevel) continue;
			const combination = { ...baselineCombination, [factor.axis]: level };
			const treatmentReport = byId.get(campaignIdFor(experiment.id, combination));
			if (!baselineReport || !treatmentReport) {
				if (!treatmentReport)
					notes.push(`${campaignIdFor(experiment.id, combination)} has no report`);
				continue;
			}
			for (const metric of design.metrics) {
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
				if (metric.kind !== 'case-metric' && metric.kind !== 'cost' && metric.kind !== 'fairness') {
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
					controlIds: [...experiment.controls],
					factor: { axis: factor.axis, baseline: baselineLevel, treatment: level },
					baseline: difference.baseline,
					treatment: difference.treatment,
					delta: difference.delta,
					interval: difference.interval,
					...(difference.p !== undefined ? { p: difference.p } : {}),
					method: difference.method,
					underpowered: difference.underpowered,
					...(slices ? { slices } : {}),
					cost: costOf(baselineReport.cells, treatmentReport.cells),
					runIds: [...baselineReport.cells, ...treatmentReport.cells].flatMap((cell) =>
						cell.runId ? [cell.runId] : []
					),
					reportIds: [baselineReport.id, treatmentReport.id]
				});
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
	lines.push(`Digest \`${result.digest}\`.`, '');
	return lines.join('\n');
}
