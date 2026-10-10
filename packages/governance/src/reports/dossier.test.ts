import { describe, expect, it } from 'vitest';
import {
	decisionDossierDigest,
	experimentResultDigest,
	parseDecisionDossier,
	type EffectRecord,
	type ExperimentResult
} from '@craftabot/core';
import { decisionDossier, renderDossierMarkdown, verdictFor } from './dossier.js';

/**
 * **The decision dossier** (plan 114 WP214): eight measures against thresholds, a verdict on each by the interval, one on the whole. A
 * ceiling at a small n reads *not shown*, not *met*; a figure on the wrong side to the end of its interval reads *not met*; and the
 * dossier is *fit* only when every measure is met.
 */
const effect = (
	metricId: string,
	baseline: { value: number; n: number; interval: [number, number] },
	over: Partial<EffectRecord> = {}
): EffectRecord => ({
	experimentId: 'x-live',
	metricId,
	controlIds: [],
	factor: { axis: 'guard', baseline: 'none', treatment: 'policy-cards' },
	baseline,
	treatment: baseline,
	delta: 0,
	interval: [0, 0],
	method: 'm',
	underpowered: false,
	cost: {
		tokensPerCase: { baseline: 1000, treatment: 1000 },
		approvalsPerCase: { baseline: 0, treatment: 0 },
		escalationRate: { baseline: 0, treatment: 0 },
		bill: {
			baseline: { tokens: 1000, modelPounds: 0.04, humanSeconds: 0, humanPounds: 0, pounds: 0.04 },
			treatment: { tokens: 1000, modelPounds: 0.04, humanSeconds: 0, humanPounds: 0, pounds: 0.04 }
		}
	},
	runIds: [],
	reportIds: [],
	tier: 'live',
	...over
});

function result(
	id: string,
	effects: EffectRecord[],
	reliability?: ExperimentResult['reliability']
): ExperimentResult {
	const body = {
		schemaVersion: 1 as const,
		id: `${id}@2026-10-09T00:00:00.000Z`,
		experimentId: id,
		title: id,
		hypothesis: 'h',
		controls: [],
		obligations: [],
		ranAt: '2026-10-09T00:00:00.000Z',
		campaignIds: [],
		effects,
		...(reliability ? { reliability } : {}),
		verdict: 'inconclusive' as const,
		note: ''
	};
	return { ...body, digest: experimentResultDigest(body) };
}

const rel = (value: number, interval: [number, number]): ExperimentResult['reliability'] => [
	{
		campaignId: 'c',
		trials: 2,
		k: 2,
		items: 100,
		skipped: 0,
		metrics: [
			{
				metricId: 'agreement',
				pass1: { value, interval, method: 'w' },
				passAtK: { value, interval, method: 'w' },
				passHatK: { value, interval, method: 'w' },
				consistency: { value, interval, method: 'w' }
			}
		]
	}
];

const AT = '2026-10-09T00:00:00.000Z';

describe('verdictFor', () => {
	it('reads by the interval, to its far end', () => {
		expect(verdictFor('at-least', 0.95, [0.96, 1])).toBe('met');
		expect(verdictFor('at-least', 0.95, [0.93, 1])).toBe('not-shown');
		expect(verdictFor('at-least', 0.95, [0.7, 0.9])).toBe('not-met');
		expect(verdictFor('at-most', 0.02, [0, 0.01])).toBe('met');
		expect(verdictFor('at-most', 0.02, [0, 0.05])).toBe('not-shown');
		expect(verdictFor('at-most', 0.02, [0.03, 0.1])).toBe('not-met');
	});
});

describe('the decision dossier (WP214)', () => {
	it('reads a ceiling at a small n as not shown, and names what would show it', () => {
		const dossier = decisionDossier({
			subject: 'x-live',
			decisionKind: 'a decision',
			model: 'M',
			result: result(
				'x-live',
				[effect('agreement', { value: 1, n: 51, interval: [0.93, 1] })],
				rel(1, [0.93, 1])
			),
			generatedAt: AT
		});
		const accuracy = dossier.measures.find((m) => m.id === 'accuracy')!;
		expect(accuracy.verdict).toBe('not-shown');
		expect(accuracy.note).toContain('straddles 95%');
		expect(dossier.verdict).toBe('not-shown');
		expect(dossier.measures.map((m) => m.id)).toEqual([
			'accuracy',
			'reliability',
			'robustness',
			'faithfulness',
			'fairness',
			'oversight',
			'cost',
			'harm'
		]);
		// Cost is a point figure and clears its ceiling; the others with no evidence say so.
		expect(dossier.measures.find((m) => m.id === 'cost')!.verdict).toBe('met');
		expect(dossier.measures.find((m) => m.id === 'fairness')!.note).toMatch(/No live design/);
	});

	it('is not fit when any measure is on the wrong side to the end of its interval', () => {
		const dossier = decisionDossier({
			subject: 'x-live',
			decisionKind: 'a decision',
			model: 'M',
			result: result('x-live', [
				effect('agreement', { value: 0.8, n: 100, interval: [0.71, 0.87] })
			]),
			generatedAt: AT
		});
		expect(dossier.measures.find((m) => m.id === 'accuracy')!.verdict).toBe('not-met');
		expect(dossier.verdict).toBe('not-fit');
		expect(dossier.summary).toContain('Not met: accuracy');
	});

	it('is fit only when every measure is met', () => {
		const strong = { value: 1, n: 5000, interval: [0.999, 1] as [number, number] };
		const dossier = decisionDossier({
			subject: 'x-live',
			decisionKind: 'a decision',
			model: 'M',
			result: result(
				'x-live',
				[
					effect('agreement', strong),
					effect('explanation-faithful', strong),
					effect('parity-gap', { value: 0.01, n: 5000, interval: [0, 0.02] }),
					effect('harm', { value: 0, n: 5000, interval: [0, 0.001] })
				],
				rel(1, [0.99, 1])
			),
			robustness: result('controls-live', [
				effect('kept-the-ball', strong),
				effect('kept-the-key', strong)
			]),
			oversight: result('x-oversight-live', [
				effect('agreement', strong, {
					factor: { axis: 'executors', baseline: 'bot-everywhere', treatment: 'person' },
					delta: 0.03,
					interval: [0.01, 0.05]
				})
			]),
			generatedAt: AT
		});
		expect(dossier.measures.map((m) => m.verdict)).toEqual(Array(8).fill('met'));
		expect(dossier.verdict).toBe('fit');
	});

	it('reads the person at the decisions by their effect, not by their presence', () => {
		const strong = { value: 1, n: 100, interval: [0.96, 1] as [number, number] };
		const make = (delta: number, interval: [number, number]) =>
			decisionDossier({
				subject: 's',
				decisionKind: 'd',
				model: 'M',
				result: result('s-live', [effect('agreement', strong)]),
				oversight: result('s-oversight-live', [
					effect('agreement', strong, {
						factor: { axis: 'executors', baseline: 'a', treatment: 'b' },
						delta,
						interval
					})
				]),
				generatedAt: AT
			}).measures.find((m) => m.id === 'oversight')!;
		expect(make(0.03, [0.01, 0.05]).verdict).toBe('met');
		expect(make(-0.02, [-0.047, 0.008]).verdict).toBe('not-shown');
		expect(make(-0.1, [-0.2, -0.05]).verdict).toBe('not-met');
	});

	it('is digested, parses back, renders as a page, and folds the same evidence to the same bytes', () => {
		const input = {
			subject: 'x-live',
			decisionKind: 'a decision',
			model: 'M',
			result: result('x-live', [
				effect('agreement', { value: 1, n: 51, interval: [0.93, 1] as [number, number] })
			]),
			generatedAt: AT
		};
		const a = decisionDossier(input);
		expect(parseDecisionDossier(JSON.parse(JSON.stringify(a)))).toEqual(a);
		expect(decisionDossier(input)).toEqual(a);
		expect(() => parseDecisionDossier({ ...a, summary: 'changed' })).toThrow(/digest mismatch/);
		expect(a.digest).toBe(decisionDossierDigest({ ...a }));
		const page = renderDossierMarkdown(a);
		expect(page).toContain('# Decision dossier — x-live');
		expect(page).toContain('| accuracy |');
		expect(page).toContain('not-shown');
	});
});
