import { experimentResultDigest, type EffectRecord, type ExperimentResult } from '@craftabot/core';
import { expandExperiment } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '$lib/packs.js';
import {
	bandText,
	deltaText,
	designFor,
	effectMatrix,
	levelsFor,
	metricChoicesFor,
	metricIdsOf,
	reportsFor,
	runIdsOf,
	verdictLamp
} from './experiments.js';

/**
 * The Experiments page's fold (WP89, `72-…` §5): a design authored over the
 * lending book is a valid experiment that expands to one campaign per
 * level; the metric choices are what the pack answers; a result's effects
 * lay out as a Matrix with the delta and its band per cell; the stored
 * reports match back to the design's campaigns.
 */
const registry = createRegistry();
const lending = registry.getWorkflow('fs-lending/lending')!;

const effect = (
	treatment: string,
	delta: number,
	slices?: EffectRecord['slices']
): EffectRecord => ({
	experimentId: 'x',
	metricId: 'success',
	controlIds: [],
	factor: { axis: 'executors', baseline: 'rules-only', treatment },
	baseline: { value: 0.5, n: 30, interval: [0.4, 0.6] },
	treatment: { value: 0.5 + delta, n: 30, interval: [0.4, 0.6] },
	delta,
	interval: [delta - 0.05, delta + 0.05],
	method: 'difference of rates, Newcombe interval at 95%; two-proportion z (unpaired)',
	underpowered: false,
	...(slices ? { slices } : {}),
	cost: {
		tokensPerCase: { baseline: 10, treatment: 12 },
		approvalsPerCase: { baseline: 0, treatment: 0 },
		escalationRate: { baseline: 0, treatment: 0 }
	},
	runIds: [`run-${treatment}-1`, 'run-shared'],
	reportIds: ['a', 'b']
});

const result = (effects: EffectRecord[]): ExperimentResult => {
	const body = {
		schemaVersion: 1 as const,
		id: 'x@2026-09-11T10:00:00.000Z',
		experimentId: 'x',
		title: 'x',
		hypothesis: 'h',
		controls: [],
		obligations: [],
		ranAt: '2026-09-11T10:00:00.000Z',
		campaignIds: ['x--executors=rules-only', 'x--executors=bot-everywhere'],
		effects,
		verdict: 'supported' as const,
		note: ''
	};
	return { ...body, digest: experimentResultDigest(body) };
};

describe('the Experiments page fold', () => {
	it('authors a design over the lending book that expands to one campaign per configuration', () => {
		const levels = levelsFor('executors', lending);
		expect(levels).toContain('rules-only');
		expect(levelsFor('context', lending)).toEqual([
			'minimal',
			'case-file',
			'relational',
			'ontology'
		]);
		expect(levelsFor('knob', lending)).toEqual([]);
		const choices = metricChoicesFor(lending, registry);
		expect(choices.map((choice) => choice.id).slice(0, 4)).toEqual([
			'success',
			'tokens',
			'approvals',
			'escalations'
		]);
		expect(choices.some((choice) => choice.id.startsWith('evaluator:fs-lending/'))).toBe(true);
		const design = designFor(
			{
				workflowId: lending.id,
				title: '',
				hypothesis: '',
				axis: 'executors',
				levels: ['rules-only', 'bot-everywhere'],
				baseline: 'rules-only',
				metrics: [choices[0]!.metric],
				seed: 1,
				size: 12
			},
			registry
		);
		expect(design.id).toBe('fs-lending-lending-executors-1-12');
		expect(design.design.template.source?.book?.items.length).toBeGreaterThan(0);
		expect(design.obligations).toEqual(lending.obligations);
		expect(design.controls).toContain('fs-lending/control-map/affordability-first');
		const { campaigns } = expandExperiment(design);
		expect(campaigns.map((campaign) => campaign.id)).toEqual([
			'fs-lending-lending-executors-1-12--executors=rules-only',
			'fs-lending-lending-executors-1-12--executors=bot-everywhere'
		]);
		expect(campaigns[1]?.builds[0]?.overrides?.configuration).toBe('bot-everywhere');
		const knobbed = designFor(
			{
				workflowId: lending.id,
				title: 'Knobs',
				hypothesis: 'Looser is worse.',
				axis: 'knob',
				knob: 'referRatioPercent',
				levels: ['40', '55'],
				baseline: '40',
				metrics: [choices[1]!.metric],
				seed: 2,
				size: 5
			},
			registry
		);
		expect(knobbed.id).toBe('fs-lending-lending-knob-referratiopercent-2-5');
		expect(knobbed.design.factors[0]).toEqual({
			axis: 'knob',
			knob: 'referRatioPercent',
			levels: ['40', '55']
		});
		expect(() =>
			designFor(
				{
					workflowId: 'nowhere',
					title: '',
					hypothesis: '',
					axis: 'executors',
					levels: ['a', 'b'],
					baseline: 'a',
					metrics: [],
					seed: 1,
					size: 1
				},
				registry
			)
		).toThrow("no workflow 'nowhere'");
	});

	it('matches the stored reports back to the design, newest per campaign', () => {
		const stored = (campaignId: string, createdAt: string, id: string) =>
			({
				id,
				campaignId,
				title: campaignId,
				createdAt,
				passed: true,
				gatesPassed: 1,
				gatesTotal: 1,
				cells: 0,
				schemaVersion: 1,
				report: {
					schemaVersion: 3,
					id,
					campaignId,
					campaignTitle: campaignId,
					createdAt,
					packVersions: {},
					noise: { misname: 0, wastedMove: 0, prematureCelebrate: 0 },
					builds: [],
					cells: [],
					gates: [],
					passed: true,
					budget: { liveCells: 0, tokensIn: 0, tokensOut: 0, liveEvaluations: 0 }
				}
			}) as never;
		const reports = reportsFor({ campaigns: ['c-a', 'c-b', 'c-missing'] }, [
			stored('c-a', '2026-09-11T09:00:00.000Z', 'old-a'),
			stored('c-a', '2026-09-11T10:00:00.000Z', 'new-a'),
			stored('c-b', '2026-09-11T09:30:00.000Z', 'b')
		]);
		expect(reports.map((report) => report.id)).toEqual(['new-a', 'b']);
	});

	it('lays a metric out as a Matrix with the delta and its band per cell, and formats deltas', () => {
		const folded = result([
			effect('bot-everywhere', 0.1, [
				{
					where: { ageBand: 'under-30' },
					delta: 0.2,
					interval: [0.1, 0.3],
					n: { baseline: 15, treatment: 15 }
				}
			]),
			effect('bot-recommends', -0.05)
		]);
		const matrix = effectMatrix(folded, 'success');
		expect(matrix.rows.map((row) => row.label)).toEqual([
			'bot-everywhere vs rules-only',
			'bot-recommends vs rules-only'
		]);
		expect(matrix.cols.map((col) => col.id)).toEqual(['all', 'ageBand=under-30']);
		expect(matrix.cell('executors:bot-everywhere', 'all')).toEqual({
			value: 0.5,
			label: '+10.0 pts',
			note: '+5.0 pts – +15.0 pts · n 30 / 30'
		});
		expect(matrix.cell('executors:bot-everywhere', 'ageBand=under-30')?.label).toBe('+20.0 pts');
		expect(matrix.cell('executors:bot-recommends', 'ageBand=under-30')).toBeUndefined();
		expect(matrix.cell('nowhere', 'all')).toBeUndefined();
		expect(effectMatrix(result([]), 'success').cell('x', 'all')).toBeUndefined();
		expect(metricIdsOf(folded)).toEqual(['success']);
		expect(runIdsOf(folded)).toEqual([
			'run-bot-everywhere-1',
			'run-shared',
			'run-bot-recommends-1'
		]);
		expect(deltaText({ method: 'difference of means, Welch' }, 1.23456)).toBe('+1.235');
		expect(deltaText({ method: 'difference of means, Welch' }, -123.456)).toBe('-123.5');
		expect(bandText({ method: 'difference of rates' }, [-0.01, 0.02])).toBe('-1.0 pts – +2.0 pts');
		expect(verdictLamp('supported')).toBe('pass');
		expect(verdictLamp('not-supported')).toBe('fail');
		expect(verdictLamp('inconclusive')).toBe('inconclusive');
	});
});
