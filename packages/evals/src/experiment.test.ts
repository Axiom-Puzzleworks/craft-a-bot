import { parseExperimentResult } from '@craftabot/core';
import { mulberry32, wilson } from '@craftabot/metrics';
import { describe, expect, it } from 'vitest';
import type { CampaignCell, CampaignReport } from './campaign.js';
import {
	analyseExperiment,
	campaignIdFor,
	effectSign,
	expandExperiment,
	experimentSchema,
	isUntestable,
	levelCombinations,
	minimumDetectableRateDifference,
	parseExperiment,
	renderExperimentMarkdown,
	verdictOf,
	type Experiment
} from './experiment.js';

/**
 * **Experiments** (WP89, `72-EXPERIMENTS.md` §6): a two-level design expands
 * to two campaigns sharing seeds; `analyse` recovers a planted 6-point
 * effect with the right sign and an interval containing it; a null design
 * over 200 seeds is inconclusive at least 95% of the time; matched pairs
 * use the sign test and the method says so; the schema validates and
 * refuses; the result round-trips through its digest.
 */
const design = (over: Partial<Experiment['design']> = {}): Experiment =>
	parseExperiment({
		schemaVersion: 1,
		id: 'lending-stack',
		title: 'The stack on the loan book',
		hypothesis: 'The policy-card stack reduces over-approval.',
		controls: ['fs-lending/policy-stack'],
		obligations: ['fca:conc:affordability'],
		design: {
			template: {
				scenarios: [],
				source: {
					kind: 'book',
					workflowId: 'fs-lending/lending',
					population: { seed: 1, size: 40 }
				},
				builds: [{ id: 'bot', base: { kind: 'starter-default' } }],
				guards: [
					{ id: 'none', fit: [] },
					{ id: 'stack', fit: [] }
				],
				brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }]
			},
			factors: [{ axis: 'guard', levels: ['none', 'stack'] }],
			baseline: { guard: 'none' },
			metrics: [
				{
					kind: 'outcome-rate',
					id: 'over-approval',
					outcome: 'STOPPED_BY_GUARDRAIL',
					direction: 'lower-is-better'
				}
			],
			seeds: [1, 2],
			...over
		}
	});

const cell = (over: Partial<CampaignCell>): CampaignCell =>
	({
		scenario: 'book',
		build: 'bot',
		guard: 'none',
		brain: 'scripted-optimal',
		tier: 'scripted-optimal',
		seed: 1,
		tags: [],
		outcome: 'SUCCESS',
		metrics: {
			ticksUsed: 1,
			tokensIn: 10,
			tokensOut: 5,
			loop: { score: 0, repeatedActions: 0, repeatedPrompts: 0 },
			wastedTickRatio: 0,
			namingMisses: 0,
			namingAmbiguities: 0,
			guardrailTrips: {},
			approvalsRequested: 0,
			approvalsDenied: 0
		},
		assertions: {},
		evaluations: {},
		labels: {},
		caseMetrics: {},
		...over
	}) as CampaignCell;

const report = (campaignId: string, cells: CampaignCell[]): CampaignReport =>
	({
		schemaVersion: 3,
		id: `report-${campaignId}`,
		campaignId,
		campaignTitle: campaignId,
		createdAt: '2026-09-11T10:00:00.000Z',
		packVersions: {},
		noise: { misname: 0, wastedMove: 0, prematureCelebrate: 0 },
		builds: [],
		cells,
		gates: [],
		passed: true,
		budget: { liveCells: 0, tokensIn: 0, tokensOut: 0, liveEvaluations: 0 }
	}) as unknown as CampaignReport;

/** A side of a rate experiment: `n` items, each hit with probability `p`, seeded; the same items on both sides. */
function side(seed: number, n: number, p: number, guard: string): CampaignCell[] {
	const random = mulberry32(seed);
	return Array.from({ length: n }, (_, i) =>
		cell({
			guard,
			seed: 1,
			item: { id: `item-${i}`, kind: 'loan-application', customerId: `c-${i}` },
			outcome: random() < p ? 'STOPPED_BY_GUARDRAIL' : 'SUCCESS',
			cohort: { ageBand: i % 2 === 0 ? 'under-30' : '30-plus' }
		})
	);
}

describe('expandExperiment', () => {
	it('expands a two-level design to two campaigns sharing seeds, ids and the template', () => {
		const experiment = design({ replicates: 2 });
		const { experiment: filled, campaigns } = expandExperiment(experiment);
		expect(campaigns.map((campaign) => campaign.id)).toEqual([
			'lending-stack--guard=none',
			'lending-stack--guard=stack'
		]);
		expect(filled.campaigns).toEqual(campaigns.map((campaign) => campaign.id));
		expect(campaigns[0]?.seeds).toEqual([2, 3, 4, 5]);
		expect(campaigns[1]?.seeds).toEqual(campaigns[0]?.seeds);
		expect(campaigns[0]?.guards.map((guard) => guard.id)).toEqual(['none']);
		expect(campaigns[1]?.guards.map((guard) => guard.id)).toEqual(['stack']);
		expect(campaigns[1]?.source?.workflowId).toBe('fs-lending/lending');
		expect(campaigns[1]?.gates[0]?.id).toBe('a-measurement-not-a-judgment');
	});

	it('sets a configuration, a knob, a context rung and a brain per level, and refuses a level the template lacks', () => {
		const experiment = design({
			factors: [
				{ axis: 'executors', levels: ['rules-only', 'bot-everywhere'] },
				{ axis: 'knob', knob: 'referRatioPercent', levels: ['40', '55'] },
				{ axis: 'context', levels: ['case-file', 'ontology'] }
			],
			baseline: { executors: 'rules-only', knob: '40', context: 'case-file' }
		});
		const { campaigns } = expandExperiment(experiment);
		expect(campaigns).toHaveLength(8);
		expect(levelCombinations(experiment.design.factors)[0]).toEqual({
			executors: 'rules-only',
			knob: '40',
			context: 'case-file'
		});
		const last = campaigns[7]!;
		expect(last.id).toBe('lending-stack--context=ontology--executors=bot-everywhere--knob=55');
		expect(last.builds[0]?.overrides).toEqual({
			configuration: 'bot-everywhere',
			knobs: { referRatioPercent: 55 }
		});
		expect(last.contexts?.[0]?.level).toBe('ontology');
		// A guard level no template guard has is a stack by that id (WP97, `89-…` §4): expanded, and refused by the runner if no pack ships it.
		const stacked = expandExperiment(
			design({ factors: [{ axis: 'guard', levels: ['none', 'missing'] }] })
		);
		expect(stacked.campaigns.at(-1)?.guards).toEqual([
			{ id: 'missing', fit: [], stack: 'missing' }
		]);
		expect(() =>
			expandExperiment(
				design({
					factors: [{ axis: 'brain', levels: ['scripted-optimal', 'other'] }],
					baseline: { brain: 'scripted-optimal' }
				})
			)
		).toThrow("no brain 'other'");
		expect(() =>
			expandExperiment(
				design({
					factors: [{ axis: 'context', levels: ['case-file', 'nowhere'] }],
					baseline: { context: 'case-file' }
				})
			)
		).toThrow("no context 'nowhere'");
	});

	it('refuses a baseline outside its levels, a missing baseline, two factors on one axis, and a knob factor without its knob', () => {
		expect(() => design({ baseline: { guard: 'other' } })).toThrow('not one of its levels');
		expect(() => design({ baseline: {} })).toThrow('needs a baseline level');
		expect(() =>
			design({
				factors: [
					{ axis: 'guard', levels: ['none', 'stack'] },
					{ axis: 'guard', levels: ['stack', 'none'] }
				]
			})
		).toThrow('one factor per axis');
		expect(() =>
			design({ factors: [{ axis: 'knob', levels: ['1', '2'] }], baseline: { knob: '1' } })
		).toThrow('names its knob');
		expect(experimentSchema.safeParse({}).success).toBe(false);
	});
});

describe('analyseExperiment', () => {
	const baseId = campaignIdFor('lending-stack', { guard: 'none' });
	const treatId = campaignIdFor('lending-stack', { guard: 'stack' });

	it('recovers a planted 6-point effect with the right sign and a containing interval, paired by the sign test', () => {
		const experiment = expandExperiment(design()).experiment;
		const reports = [
			report(baseId, side(11, 4000, 0.3, 'none')),
			report(treatId, side(12, 4000, 0.24, 'stack'))
		];
		const result = analyseExperiment(experiment, reports, { ranAt: '2026-09-11T10:00:00.000Z' });
		expect(result.effects).toHaveLength(1);
		const effect = result.effects[0]!;
		expect(effect.factor).toEqual({ axis: 'guard', baseline: 'none', treatment: 'stack' });
		expect(effect.delta).toBeLessThan(0);
		expect(effect.delta).toBeGreaterThan(-0.1);
		expect(effect.interval[0]).toBeLessThan(-0.06);
		expect(effect.interval[1]).toBeGreaterThan(-0.06);
		expect(effect.interval[1]).toBeLessThan(0);
		expect(effect.method).toContain('sign test over');
		expect(effect.method).toContain('of 4000 pairs');
		expect(effect.p).toBeLessThan(0.01);
		expect(effect.underpowered).toBe(false);
		expect(effect.baseline.n).toBe(4000);
		expect(effect.slices?.map((slice) => slice.where)).toEqual([
			{ ageBand: '30-plus' },
			{ ageBand: 'under-30' }
		]);
		expect(effect.reportIds).toEqual([`report-${baseId}`, `report-${treatId}`]);
		expect(effect.cost.tokensPerCase).toEqual({ baseline: 15, treatment: 15 });
		expect(result.verdict).toBe('supported');
		expect(result.note).toContain('minimum detectable difference');
		expect(result.campaignIds).toEqual([baseId, treatId]);
		expect(parseExperimentResult(JSON.parse(JSON.stringify(result))).digest).toBe(result.digest);
		expect(() => parseExperimentResult({ ...result, note: 'tampered' })).toThrow('digest mismatch');
		const markdown = renderExperimentMarkdown(result);
		expect(markdown).toContain('**Verdict: supported.**');
		expect(markdown).toContain('| guard | stack vs none |');
	});

	it('joins a level’s own controls to that level’s effects only (WP150)', () => {
		const levelled = design({
			template: {
				...design().design.template,
				guards: [
					{ id: 'none', fit: [] },
					{ id: 'stack', fit: [] },
					{ id: 'other', fit: [] }
				]
			},
			factors: [
				{
					axis: 'guard',
					levels: ['none', 'stack', 'other'],
					controls: { stack: ['map/stack-row'], other: ['map/other-row'] }
				}
			]
		});
		const experiment = expandExperiment(levelled).experiment;
		const otherId = campaignIdFor('lending-stack', { guard: 'other' });
		const result = analyseExperiment(
			experiment,
			[
				report(baseId, side(11, 50, 0.3, 'none')),
				report(treatId, side(12, 50, 0.2, 'stack')),
				report(otherId, side(13, 50, 0.1, 'other'))
			],
			{ ranAt: '2026-09-11T10:00:00.000Z' }
		);
		expect(result.effects.map((effect) => [effect.factor.treatment, effect.controlIds])).toEqual([
			['stack', ['fs-lending/policy-stack', 'map/stack-row']],
			['other', ['fs-lending/policy-stack', 'map/other-row']]
		]);
		expect(() =>
			design({ factors: [{ axis: 'guard', levels: ['none', 'stack'], controls: { gone: [] } }] })
		).toThrow('a factor’s controls name its own levels');
		expect(() =>
			design({
				factors: [{ axis: 'guard', levels: ['none', 'stack'], primary: { stack: 'nothing' } }]
			})
		).toThrow("'nothing' is not one of the design's metrics");
		const twoMetrics = design({
			factors: [{ axis: 'guard', levels: ['none', 'stack'], primary: { stack: 'tokens' } }],
			metrics: [
				...design().design.metrics,
				{ kind: 'cost', id: 'tokens', of: 'tokens', direction: 'lower-is-better' }
			]
		});
		const led = analyseExperiment(
			expandExperiment(twoMetrics).experiment,
			[report(baseId, side(11, 50, 0.3, 'none')), report(treatId, side(12, 50, 0.2, 'stack'))],
			{ ranAt: '2026-09-11T10:00:00.000Z' }
		);
		expect(led.effects.map((effect) => effect.metricId)).toEqual(['tokens', 'over-approval']);
	});

	it('joins the claims of a stack a guard names, whatever the guard is called (WP150)', () => {
		const stacked = design({
			template: {
				...design().design.template,
				guards: [
					{ id: 'none', fit: [] },
					{ id: 'stack', fit: [], stack: 'desk/stack/policy-cards' }
				]
			}
		});
		const result = analyseExperiment(
			expandExperiment(stacked).experiment,
			[report(baseId, side(11, 50, 0.3, 'none')), report(treatId, side(12, 50, 0.2, 'stack'))],
			{
				ranAt: '2026-09-11T10:00:00.000Z',
				stacks: [{ id: 'desk/stack/policy-cards', controls: ['desk/control-map/a-row'] } as never]
			}
		);
		expect(result.effects[0]!.controlIds).toEqual([
			'fs-lending/policy-stack',
			'desk/control-map/a-row'
		]);
	});

	it('slices an effect by scenario when the design runs several (WP153)', () => {
		const experiment = expandExperiment(design()).experiment;
		const cells = (guard: string, failOn: string | undefined) =>
			['radio', 'note'].flatMap((scenario) =>
				Array.from({ length: 20 }, (_, i) =>
					cell({
						guard,
						scenario,
						seed: i + 1,
						outcome: scenario === failOn ? 'STOPPED_BY_GUARDRAIL' : 'SUCCESS'
					})
				)
			);
		const result = analyseExperiment(
			experiment,
			[report(baseId, cells('none', undefined)), report(treatId, cells('stack', 'radio'))],
			{ ranAt: '2026-09-11T10:00:00.000Z' }
		);
		const slices = result.effects[0]!.slices!.filter((slice) => 'scenario' in slice.where);
		expect(slices.map((slice) => [slice.where.scenario, slice.delta])).toEqual([
			['note', 0],
			['radio', 1]
		]);
		expect(result.effects[0]!.delta).toBe(0.5);
	});

	it('reads an assertion card’s pass rate per cell (WP150)', () => {
		const experiment = expandExperiment(
			design({
				metrics: [
					{
						kind: 'assertion-pass-rate',
						id: 'held',
						cardId: 'campaign/never-sends-the-alert',
						direction: 'higher-is-better'
					}
				]
			})
		).experiment;
		const held = (guard: string, holds: boolean) =>
			Array.from({ length: 20 }, (_, i) =>
				cell({ guard, seed: i + 1, assertions: { 'campaign/never-sends-the-alert': holds } })
			);
		const result = analyseExperiment(
			experiment,
			[report(baseId, held('none', false)), report(treatId, held('stack', true))],
			{ ranAt: '2026-09-11T10:00:00.000Z' }
		);
		expect(result.effects[0]).toMatchObject({
			metricId: 'held',
			baseline: { value: 0, n: 20 },
			treatment: { value: 1, n: 20 },
			delta: 1
		});
		expect(result.effects[0]!.untestable).toBeUndefined();
	});

	it('is inconclusive at least 95% of the time on a null design over 200 seeds', () => {
		const experiment = expandExperiment(design()).experiment;
		let inconclusive = 0;
		const seeds = 200;
		for (let seed = 1; seed <= seeds; seed += 1) {
			const reports = [
				report(baseId, side(seed * 7919, 400, 0.3, 'none')),
				report(treatId, side(seed * 7919 + 104729, 400, 0.3, 'stack'))
			];
			const result = analyseExperiment(experiment, reports, { ranAt: '2026-09-11T10:00:00.000Z' });
			if (result.verdict === 'inconclusive') inconclusive += 1;
		}
		// A 95% interval false-alarms 5% of the time in the limit; over 200 seeds the bound is 5%
		// plus the Wilson margin at that many seeds, as the validation suite states it (`68-…` §3.3).
		const [, upper] = wilson(Math.round(seeds * 0.05), seeds);
		expect(inconclusive / seeds).toBeGreaterThanOrEqual(1 - upper);
		expect(inconclusive / seeds).toBeGreaterThanOrEqual(0.9);
	}, 60_000);

	it('reads a mean metric with Welch and the paired sign test, a fairness metric with no test, and says not-supported when an effect goes the wrong way', () => {
		const experiment = expandExperiment(
			design({
				metrics: [
					{ kind: 'cost', id: 'tokens', of: 'tokens', direction: 'lower-is-better' },
					{ kind: 'case-metric', id: 'ticks', name: 'ticks', direction: 'lower-is-better' },
					{
						kind: 'fairness',
						id: 'parity',
						metric: 'demographic-parity',
						across: 'ageBand',
						direction: 'lower-is-better'
					}
				]
			})
		).experiment;
		const decided = (guard: string, tokens: number) =>
			side(3, 200, 0.3, guard).map((entry, i) =>
				cell({
					...entry,
					metrics: { ...entry.metrics, tokensIn: tokens + (i % 3), tokensOut: 0 },
					caseMetrics: { ticks: 4 + (i % 2) },
					decision: { outcome: i % 4 === 0 ? 'decline' : 'approve', verdict: 'approve' }
				})
			);
		const result = analyseExperiment(
			experiment,
			[report(baseId, decided('none', 10)), report(treatId, decided('stack', 20))],
			{ ranAt: '2026-09-11T10:00:00.000Z' }
		);
		const tokens = result.effects.find((effect) => effect.metricId === 'tokens')!;
		expect(tokens.delta).toBeCloseTo(10, 6);
		expect(tokens.method).toContain('Welch');
		expect(tokens.method).toContain('sign test over 200 non-tied of 200 pairs');
		expect(tokens.p).toBeLessThan(0.001);
		const ticks = result.effects.find((effect) => effect.metricId === 'ticks')!;
		expect(ticks.delta).toBeCloseTo(0, 6);
		const parity = result.effects.find((effect) => effect.metricId === 'parity')!;
		expect(parity.p).toBeUndefined();
		expect(parity.method).toContain('no test');
		expect(parity.slices).toBeUndefined();
		// tokens went up under lower-is-better: the wrong way.
		expect(result.verdict).toBe('not-supported');
		expect(effectSign(tokens, 'lower-is-better')).toBe(-1);
		expect(effectSign(tokens, 'higher-is-better')).toBe(1);
		expect(effectSign(ticks, 'lower-is-better')).toBe(0);
		expect(verdictOf([], [])).toBe('inconclusive');
	});

	it('notes a missing report and an unreadable metric instead of failing, and flags an underpowered effect', () => {
		const experiment = expandExperiment(
			design({
				metrics: [
					{
						kind: 'outcome-rate',
						id: 'over-approval',
						outcome: 'STOPPED_BY_GUARDRAIL',
						direction: 'lower-is-better'
					},
					{
						kind: 'fairness',
						id: 'parity',
						metric: 'demographic-parity',
						across: 'ageBand',
						direction: 'lower-is-better'
					}
				]
			})
		).experiment;
		const missing = analyseExperiment(experiment, [report(baseId, side(1, 10, 0.3, 'none'))], {
			ranAt: '2026-09-11T10:00:00.000Z'
		});
		expect(missing.effects).toEqual([]);
		expect(missing.verdict).toBe('inconclusive');
		expect(missing.note).toContain(`${treatId} has no report`);
		const small = analyseExperiment(
			experiment,
			[report(baseId, side(1, 10, 0.3, 'none')), report(treatId, side(2, 10, 0.3, 'stack'))],
			{ ranAt: '2026-09-11T10:00:00.000Z' }
		);
		expect(small.effects).toHaveLength(1);
		expect(small.effects[0]?.underpowered).toBe(true);
		expect(small.note).toContain('underpowered');
		expect(small.note).toContain('parity: no reading');
		expect(minimumDetectableRateDifference(0.3, 0, 0.95)).toBe(1);
		expect(minimumDetectableRateDifference(0.3, 4000, 0.95)).toBeCloseTo(0.0287, 3);
	});
});

describe('the tier and the untestable verdict (WP116, `103-FALLIBLE-ACTORS.md` §6)', () => {
	const rate = { kind: 'outcome-rate' as const };
	const at = (value: number, width = 0.05) => ({
		value,
		n: 100,
		interval: [Math.max(0, value - width), Math.min(1, value + width)] as [number, number]
	});

	it('a rate at the same bound on both sides is untestable; anything that can move is not', () => {
		expect(isUntestable(rate, at(1), at(1))).toBe(true);
		expect(isUntestable(rate, at(0), at(0))).toBe(true);
		expect(isUntestable(rate, at(0.9), at(0.9))).toBe(false);
		expect(isUntestable(rate, at(1), at(0.95))).toBe(false);
		const flat = { value: 2, n: 50, interval: [2, 2] as [number, number] };
		expect(isUntestable({ kind: 'cost' }, flat, flat)).toBe(true);
		expect(isUntestable({ kind: 'cost' }, flat, { ...flat, interval: [1.5, 2.5] })).toBe(false);
	});

	it('untestable effects leave the verdict; all of them make it untestable', () => {
		const metrics = [{ id: 'm', direction: 'higher-is-better' as const }];
		const ceiling = {
			metricId: 'm',
			interval: [-0.02, 0.02] as [number, number],
			untestable: true as const
		};
		const moved = { metricId: 'm', interval: [0.03, 0.12] as [number, number] };
		expect(verdictOf([ceiling, ceiling], metrics)).toBe('untestable');
		expect(verdictOf([ceiling, moved], metrics)).toBe('supported');
	});

	it('measures the control under each brain level, names the tier, and never compares brains', () => {
		const experiment = design({
			factors: [
				{ axis: 'guard', levels: ['none', 'stack'] },
				{ axis: 'brain', levels: ['scripted-optimal', 'fallible'] }
			],
			baseline: { guard: 'none', brain: 'scripted-optimal' }
		});
		experiment.design.template.brains = [
			{ id: 'scripted-optimal', tier: 'scripted-optimal' },
			{ id: 'fallible', tier: 'fallible', errorModel: 'fs-lending/error/decision' }
		];
		const id = (guard: string, brain: string) => campaignIdFor(experiment.id, { guard, brain });
		const all = (guard: string, value: string) =>
			Array.from({ length: 100 }, (_, i) =>
				cell({
					guard,
					item: { id: `item-${i}`, kind: 'loan-application', customerId: `c-${i}` },
					outcome: value as CampaignCell['outcome']
				})
			);
		const reports = [
			report(id('none', 'scripted-optimal'), all('none', 'SUCCESS')),
			report(id('stack', 'scripted-optimal'), all('stack', 'SUCCESS')),
			report(id('none', 'fallible'), side(1, 100, 0.3, 'none')),
			report(id('stack', 'fallible'), side(2, 100, 0.02, 'stack'))
		];
		const result = analyseExperiment(experiment, reports, { ranAt: '2026-09-29T00:00:00.000Z' });
		expect(
			result.effects.map((effect) => [effect.factor.axis, effect.tier, effect.untestable ?? false])
		).toEqual([
			['guard', 'scripted-optimal', true],
			['guard', 'fallible', false]
		]);
		expect(result.effects[1]?.interval[1]).toBeLessThan(0);
		expect(result.verdict).toBe('supported');
	});
});
