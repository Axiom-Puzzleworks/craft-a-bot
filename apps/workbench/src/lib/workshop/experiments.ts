import {
	CONTEXT_LEVELS,
	slugOf,
	type EffectRecord,
	type ExperimentResult,
	type ExperimentVerdict,
	type PackRegistry,
	type StoredCampaignReport,
	type WorkflowSpec
} from '@craftabot/core';
import {
	parseExperiment,
	type CampaignReport,
	type Experiment,
	type ExperimentMetric
} from '@craftabot/evals';
import type { Status } from '$lib/control-room/dataviz.js';
import { reportFrom } from './campaign-cells.js';

/**
 * **Experiments on the page** (WP89, `72-EXPERIMENTS.md` §5): the design a
 * reader authors over a book — one factor, its levels and baseline, the
 * metrics the pack answers — as the file it is; the reports the runner
 * stored matched back to the design's campaigns; the result's effects laid
 * out for a `Matrix` per metric. Every number is the result's own; the page
 * draws.
 */
export type AuthorAxis = 'executors' | 'knob' | 'context';

export interface MetricChoice {
	id: string;
	label: string;
	metric: ExperimentMetric;
}

/** The metrics a workflow's pack can answer: the success rate, the cost, each per-case metric of the world, each evaluator of the pack. */
export function metricChoicesFor(workflow: WorkflowSpec, registry: PackRegistry): MetricChoice[] {
	const world = registry.getWorld(workflow.worldId);
	const prefix = `${workflow.id.split('/')[0] ?? ''}/`;
	const choices: MetricChoice[] = [
		{
			id: 'success',
			label: 'success rate',
			metric: {
				kind: 'outcome-rate',
				id: 'success',
				outcome: 'SUCCESS',
				direction: 'higher-is-better'
			}
		},
		{
			id: 'tokens',
			label: 'tokens per case',
			metric: { kind: 'cost', id: 'tokens', of: 'tokens', direction: 'lower-is-better' }
		},
		{
			id: 'approvals',
			label: 'approvals per case',
			metric: { kind: 'cost', id: 'approvals', of: 'approvals', direction: 'lower-is-better' }
		},
		{
			id: 'escalations',
			label: 'escalation rate',
			metric: { kind: 'cost', id: 'escalations', of: 'escalations', direction: 'lower-is-better' }
		}
	];
	for (const metric of world?.metrics ?? []) {
		choices.push({
			id: `case:${metric.id}`,
			label: metric.name,
			metric: { kind: 'case-metric', id: metric.id, name: metric.id, direction: 'lower-is-better' }
		});
	}
	for (const evaluator of registry.listEvaluators()) {
		if (!evaluator.id.startsWith(prefix)) continue;
		choices.push({
			id: `evaluator:${evaluator.id}`,
			label: `${evaluator.name} (pass rate)`,
			metric: {
				kind: 'evaluator-pass-rate',
				id: evaluator.id,
				evaluatorId: evaluator.id,
				direction: 'higher-is-better'
			}
		});
	}
	return choices;
}

/** The levels an axis offers for a workflow: its configurations, the context rungs; a knob's are typed. */
export function levelsFor(axis: AuthorAxis, workflow: WorkflowSpec): string[] {
	if (axis === 'executors') return Object.keys(workflow.configurations ?? {});
	if (axis === 'context') return [...CONTEXT_LEVELS];
	return [];
}

export interface AuthorInput {
	workflowId: string;
	title: string;
	hypothesis: string;
	axis: AuthorAxis;
	knob?: string | undefined;
	levels: string[];
	baseline: string;
	metrics: ExperimentMetric[];
	seed: number;
	size: number;
	controls?: string[] | undefined;
}

/** The design as a file: the book drawn here and carried inline (the Worker draws nothing), the world's senses and actions on one build. */
export function designFor(input: AuthorInput, registry: PackRegistry): Experiment {
	const workflow = registry.getWorkflow(input.workflowId);
	if (!workflow) throw new Error(`no workflow '${input.workflowId}'`);
	if (!workflow.book) throw new Error(`${workflow.name} draws no book of its own`);
	const world = registry.getWorld(workflow.worldId);
	const size = Math.max(1, Math.floor(input.size));
	const seed = Math.floor(input.seed);
	const book = workflow.book({ seed, size });
	const id = `${slugOf(workflow.id)}-${input.axis}${input.knob ? `-${slugOf(input.knob)}` : ''}-${seed}-${size}`;
	return parseExperiment({
		schemaVersion: 1,
		id,
		title: input.title.trim() || `${workflow.name}: ${input.axis} on the book at seed ${seed}`,
		hypothesis:
			input.hypothesis.trim() ||
			`Changing ${input.axis}${input.knob ? ` (${input.knob})` : ''} from ${input.baseline} changes the pre-registered metrics.`,
		// The pack's own control rows, so the register can fold this result (WP90).
		controls:
			input.controls ??
			registry
				.listControlMaps()
				.filter((map) => map.id.startsWith(`${workflow.id.split('/')[0] ?? ''}/`))
				.flatMap((map) => map.rows.map((row) => `${map.id}/${row.ref}`)),
		obligations: [...(workflow.obligations ?? [])],
		design: {
			template: {
				scenarios: [],
				source: { kind: 'book', workflowId: workflow.id, book },
				builds: [
					{
						id: 'bot',
						base: { kind: 'starter-default' },
						overrides: {
							senses: (world?.senses ?? []).map((sense) => sense.id),
							actions: (world?.actions ?? []).map((action) => action.id)
						}
					}
				],
				guards: [{ id: 'none', fit: [] }],
				brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }]
			},
			factors: [
				{
					axis: input.axis,
					levels: input.levels,
					...(input.axis === 'knob' && input.knob ? { knob: input.knob } : {})
				}
			],
			baseline: { [input.axis]: input.baseline },
			metrics: input.metrics,
			seeds: [seed]
		}
	});
}

/** The stored reports the design's campaigns produced, one per campaign id, the newest when several. */
export function reportsFor(
	experiment: Pick<Experiment, 'campaigns'>,
	stored: readonly StoredCampaignReport[]
): CampaignReport[] {
	const reports: CampaignReport[] = [];
	for (const campaignId of experiment.campaigns) {
		const rows = stored
			.filter((row) => row.campaignId === campaignId)
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
		const report = rows[0] ? reportFrom(rows[0]) : undefined;
		if (report) reports.push(report);
	}
	return reports;
}

export const verdictLamp = (verdict: ExperimentVerdict): Status =>
	verdict === 'supported' ? 'pass' : verdict === 'not-supported' ? 'fail' : 'inconclusive';

const isRate = (effect: Pick<EffectRecord, 'method'>): boolean =>
	effect.method.startsWith('difference of rates');

/** A delta as the page shows it: points for a rate, three places otherwise, signed. */
export function deltaText(effect: Pick<EffectRecord, 'method'>, delta: number): string {
	if (isRate(effect)) return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pts`;
	return `${delta >= 0 ? '+' : ''}${Math.abs(delta) < 10 ? delta.toFixed(3) : delta.toFixed(1)}`;
}

export function bandText(effect: Pick<EffectRecord, 'method'>, interval: [number, number]): string {
	return `${deltaText(effect, interval[0])} – ${deltaText(effect, interval[1])}`;
}

export interface EffectMatrix {
	rows: { id: string; label: string }[];
	cols: { id: string; label: string }[];
	cell: (
		rowId: string,
		colId: string
	) => { value: number; label: string; note?: string | undefined } | undefined;
}

const sliceKey = (where: Record<string, string>): string =>
	Object.entries(where)
		.map(([attribute, value]) => `${attribute}=${value}`)
		.join(',');

/** One metric's effects as a Matrix: a row per treatment level, a column for all cases and one per cohort slice, the delta with its band in the cell, its fill the delta's share of the largest. */
export function effectMatrix(result: ExperimentResult, metricId: string): EffectMatrix {
	const effects = result.effects.filter((effect) => effect.metricId === metricId);
	const rows = effects.map((effect) => ({
		id: `${effect.factor.axis}:${effect.factor.treatment}`,
		label: `${effect.factor.treatment} vs ${effect.factor.baseline}`
	}));
	const sliceKeys = [
		...new Set(
			effects.flatMap((effect) => (effect.slices ?? []).map((slice) => sliceKey(slice.where)))
		)
	].sort();
	const cols = [
		{ id: 'all', label: 'all cases' },
		...sliceKeys.map((key) => ({ id: key, label: key }))
	];
	const largest = Math.max(
		...effects.flatMap((effect) => [
			Math.abs(effect.delta),
			...(effect.slices ?? []).map((slice) => Math.abs(slice.delta))
		]),
		0
	);
	const share = (delta: number): number => (largest === 0 ? 0 : Math.abs(delta) / largest);
	return {
		rows,
		cols,
		cell: (rowId, colId) => {
			const effect = effects.find(
				(entry) => `${entry.factor.axis}:${entry.factor.treatment}` === rowId
			);
			if (!effect) return undefined;
			if (colId === 'all') {
				return {
					value: share(effect.delta),
					label: deltaText(effect, effect.delta),
					note: `${bandText(effect, effect.interval)} · n ${effect.baseline.n} / ${effect.treatment.n}${effect.underpowered ? ' · underpowered' : ''}`
				};
			}
			const slice = (effect.slices ?? []).find((entry) => sliceKey(entry.where) === colId);
			if (!slice) return undefined;
			return {
				value: share(slice.delta),
				label: deltaText(effect, slice.delta),
				note: `${bandText(effect, slice.interval)} · n ${slice.n.baseline} / ${slice.n.treatment}`
			};
		}
	};
}

/** The seeds each campaign of an expansion runs — the same on every one. */
export function seedsOf(campaigns: ReadonlyArray<{ seeds: readonly number[] }>): number {
	return campaigns[0]?.seeds.length ?? 0;
}

/** Every metric id a result carries, in the order its effects name them. */
export function metricIdsOf(result: Pick<ExperimentResult, 'effects'>): string[] {
	return [...new Set(result.effects.map((effect) => effect.metricId))];
}

/** Every run behind a result, once each. */
export function runIdsOf(result: Pick<ExperimentResult, 'effects'>): string[] {
	return [...new Set(result.effects.flatMap((effect) => effect.runIds))];
}
