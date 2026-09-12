import type { ControlMap, EffectRecord, ExperimentResult } from '@craftabot/core';
import { experimentResultDigest } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { controlEffectiveness } from './control-effectiveness.js';

/**
 * The register (WP90, `80-…` §5): an untested control reads `untested`; the
 * headline is the largest-n effect on the primary metric; `evidenced` and
 * `inconclusive` come from the intervals; coverage counts experiments,
 * populations, contexts and workflows; a bare id an experiment named that
 * no map lists comes after the maps' rows.
 */
const effect = (over: Partial<EffectRecord> & { controlIds: string[] }): EffectRecord => ({
	experimentId: 'lending-stack',
	metricId: 'agreement',
	factor: { axis: 'guard', baseline: 'none', treatment: 'policy-cards' },
	baseline: { value: 0.8, n: 100, interval: [0.7, 0.9] },
	treatment: { value: 0.9, n: 100, interval: [0.8, 1] },
	delta: 0.1,
	interval: [0.02, 0.18],
	method: 'difference of rates',
	underpowered: false,
	cost: {
		tokensPerCase: { baseline: 10, treatment: 12 },
		approvalsPerCase: { baseline: 0, treatment: 1 },
		escalationRate: { baseline: 0, treatment: 0 },
		touchesPerCase: { baseline: 2, treatment: 1 }
	},
	runIds: ['r1'],
	reportIds: ['a', 'b'],
	...over
});

const result = (
	id: string,
	effects: EffectRecord[],
	over: Partial<Omit<ExperimentResult, 'digest'>> = {}
): ExperimentResult => {
	const body = {
		schemaVersion: 1 as const,
		id: `${id}@2026-09-11T10:00:00.000Z`,
		experimentId: id,
		title: id,
		hypothesis: 'h',
		controls: [],
		obligations: ['fca:conc:affordability'],
		ranAt: '2026-09-11T10:00:00.000Z',
		campaignIds: [],
		effects,
		verdict: 'inconclusive' as const,
		note: '',
		...over
	};
	return { ...body, digest: experimentResultDigest(body) };
};

const maps: ControlMap[] = [
	{
		id: 'fs-lending/control-map',
		title: 'Lending',
		description: '',
		rows: [
			{
				framework: 'FCA',
				ref: 'affordability-first',
				title: 'Affordability first',
				obligation: 'CONC',
				evidence: [],
				tags: ['fca:conc:affordability'],
				status: 'unreviewed'
			},
			{
				framework: 'FCA',
				ref: 'four-eyes',
				title: 'Four eyes',
				obligation: 'SS1/23',
				evidence: [],
				tags: ['pra:ss1-23:mitigants']
			}
		]
	} as ControlMap
];

describe('controlEffectiveness', () => {
	it('reads untested with no results, one row per map row in the maps’ order', () => {
		const rows = controlEffectiveness([], maps);
		expect(rows.map((row) => [row.controlId, row.status])).toEqual([
			['fs-lending/control-map/affordability-first', 'untested'],
			['fs-lending/control-map/four-eyes', 'untested']
		]);
		expect(rows[0]?.controlMapRow?.title).toBe('Affordability first');
		expect(rows[0]?.obligations).toEqual(['fca:conc:affordability']);
		expect(rows[0]?.headline).toBeUndefined();
		expect(rows[0]?.coverage).toEqual({
			experiments: 0,
			populations: [],
			contexts: [],
			workflows: []
		});
	});

	it('takes the largest-n effect on the primary metric as the headline, and evidenced from its interval', () => {
		const small = effect({ controlIds: ['fs-lending/control-map/affordability-first'] });
		const large = effect({
			controlIds: ['fs-lending/control-map/affordability-first'],
			experimentId: 'lending-context',
			factor: { axis: 'context', baseline: 'case-file', treatment: 'ontology' },
			baseline: { value: 0.8, n: 400, interval: [0.76, 0.84] },
			treatment: { value: 0.86, n: 400, interval: [0.82, 0.9] },
			delta: 0.06,
			interval: [0.01, 0.11]
		});
		const other = effect({
			controlIds: ['fs-lending/control-map/affordability-first'],
			metricId: 'tokens',
			delta: 5,
			interval: [-1, 11]
		});
		const rows = controlEffectiveness(
			[
				result('lending-stack', [small, other], {
					populationDigest: 'p1',
					workflowIds: ['fs-lending/lending']
				}),
				result('lending-context', [large], {
					populationDigest: 'p2',
					workflowIds: ['fs-lending/lending']
				})
			],
			maps
		);
		const row = rows[0]!;
		expect(row.status).toBe('evidenced');
		expect(row.headline).toEqual({
			metricId: 'agreement',
			delta: 0.06,
			interval: [0.01, 0.11],
			n: 800,
			experimentId: 'lending-context',
			resultId: 'lending-context@2026-09-11T10:00:00.000Z',
			underpowered: false
		});
		expect(row.effects).toHaveLength(3);
		expect(row.cost).toEqual({ tokensPerCase: 12, approvalsPerCase: 1, touchesPerCase: 1 });
		expect(row.coverage).toEqual({
			experiments: 2,
			populations: ['p1', 'p2'],
			contexts: ['case-file', 'ontology'],
			workflows: ['fs-lending/lending']
		});
		expect(rows[1]?.status).toBe('untested');
	});

	it('reads inconclusive when every effect’s interval spans zero, and lists a bare id after the maps', () => {
		const spanning = effect({
			controlIds: ['fs-lending/control-map/four-eyes', 'starter/safety'],
			delta: 0.01,
			interval: [-0.05, 0.07],
			underpowered: true,
			cost: {
				tokensPerCase: { baseline: 10, treatment: 12 },
				approvalsPerCase: { baseline: 0, treatment: 1 },
				escalationRate: { baseline: 0, treatment: 0 }
			}
		});
		const rows = controlEffectiveness([result('x', [spanning])], maps);
		expect(rows.map((row) => [row.controlId, row.status])).toEqual([
			['fs-lending/control-map/affordability-first', 'untested'],
			['fs-lending/control-map/four-eyes', 'inconclusive'],
			['starter/safety', 'inconclusive']
		]);
		expect(rows[1]?.headline?.underpowered).toBe(true);
		expect(rows[1]?.cost.touchesPerCase).toBeUndefined();
		expect(rows[2]?.controlMapRow).toBeUndefined();
		expect(rows[2]?.obligations).toEqual(['fca:conc:affordability']);
	});
});
