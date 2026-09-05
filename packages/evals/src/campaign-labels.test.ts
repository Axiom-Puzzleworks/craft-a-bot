import type { ConfusionLabelSemantics } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { renderJUnit } from './campaign-junit.js';
import { renderSarif } from './campaign-sarif.js';
import { CASE_TABLE_CAP, renderCampaignScorecard } from './campaign-scorecard.js';
import { confusionOf, derivedOf, summariseCampaign } from './campaign-summary.js';
import {
	CAMPAIGN_REPORT_SCHEMA_VERSION,
	cohortOf,
	evaluateGate,
	metricNameSchema,
	parseCampaignReport,
	selectCells,
	type CampaignCell,
	type CampaignReport
} from './campaign.js';

/**
 * **Labels, cohorts and the summary** (WP61, `50-DOMAIN-METRICS.md` §11):
 * a hand-built cell set folds to a known matrix and known derived rates; a
 * `label-rate` gate reads one label's share; a `parity` gate fails over a
 * planted skew and passes over matched cells, and is inconclusive with one
 * value; `where.cohort` slices; a case metric gates; a v1 report loads and
 * a `no-regression` gate against it says so.
 */
const SEMANTICS: ConfusionLabelSemantics = {
	kind: 'confusion',
	truePositive: 'tp',
	falsePositive: 'fp',
	trueNegative: 'tn',
	falseNegative: 'fn'
};
const EVALUATOR = 'fs-fraud/alert-decision';

const cell = (over: Partial<CampaignCell>): CampaignCell => ({
	scenario: 'queue',
	build: 'b',
	guard: 'cards',
	brain: 'scripted-optimal',
	tier: 'scripted-optimal',
	seed: 1,
	tags: ['fca:cd:support', 'poca:tipping-off'],
	outcome: 'SUCCESS',
	metrics: {
		outcome: 'SUCCESS',
		ticksUsed: 4,
		tokensIn: 10,
		tokensOut: 5,
		loop: { longestStreak: 1, repeatedFailures: 0 },
		wastedTickRatio: 0,
		namingMisses: 0,
		namingAmbiguities: 0,
		guardrailTrips: {},
		approvalsRequested: 1,
		approvalsDenied: 0
	},
	assertions: {},
	evaluations: {},
	labels: {},
	caseMetrics: {},
	...over
});

/** 6 tp, 2 fp, 10 tn, 2 fn — precision 0.75, recall 0.75, F1 0.75, FPR 1/6. */
const labelled = (label: string, n: number, over: Partial<CampaignCell> = {}) =>
	Array.from({ length: n }, (_, i) =>
		cell({
			seed: i + 1,
			labels: { [EVALUATOR]: label },
			evaluations: { [EVALUATOR]: 'pass' },
			...over
		})
	);
const MATRIX_CELLS: CampaignCell[] = [
	...labelled('tp', 6),
	...labelled('fp', 2),
	...labelled('tn', 10),
	...labelled('fn', 2)
];

describe('the confusion fold', () => {
	it('folds a hand-built cell set to the known matrix and the derived rates', () => {
		const matrix = confusionOf(MATRIX_CELLS, EVALUATOR, SEMANTICS);
		expect(matrix).toMatchObject({ tp: 6, fp: 2, tn: 10, fn: 2 });
		expect(matrix.precision).toBeCloseTo(0.75);
		expect(matrix.recall).toBeCloseTo(0.75);
		expect(matrix.f1).toBeCloseTo(0.75);
		expect(matrix.falsePositiveRate).toBeCloseTo(1 / 6);
		expect(derivedOf(MATRIX_CELLS, EVALUATOR, 'recall', SEMANTICS)).toBeCloseTo(0.75);
	});

	it('leaves an empty denominator undefined rather than claiming a rate', () => {
		const onlyNegatives = [...labelled('tn', 3), ...labelled('fn', 1)];
		const matrix = confusionOf(onlyNegatives, EVALUATOR, SEMANTICS);
		expect(matrix.precision).toBeUndefined();
		expect(matrix.recall).toBe(0);
		expect(matrix.f1).toBeUndefined();
		expect(matrix.falsePositiveRate).toBe(0);
	});

	it('the summary carries the matrix per slice and for the whole, and no matrix without semantics', () => {
		const withSemantics = summariseCampaign(MATRIX_CELLS, {
			semantics: (id) => (id === EVALUATOR ? SEMANTICS : undefined)
		});
		expect(withSemantics.matrices.map((m) => m.slice)).toEqual([
			{},
			{ scenario: 'queue', guard: 'cards', brain: 'scripted-optimal' }
		]);
		expect(withSemantics.matrices[0]).toMatchObject({ evaluatorId: EVALUATOR, tp: 6, fn: 2 });
		expect(withSemantics.slices[0]?.labels[EVALUATOR]).toEqual({ tp: 6, fp: 2, tn: 10, fn: 2 });
		expect(summariseCampaign(MATRIX_CELLS).matrices).toEqual([]);
		// The obligation table: the Consumer Duty's outcomes first, then the rest alphabetically.
		expect(withSemantics.obligations.map((row) => row.tag)).toEqual([
			'fca:cd:support',
			'poca:tipping-off'
		]);
		expect(withSemantics.cases).toHaveLength(20);
		expect(withSemantics.cases[0]).toMatchObject({
			cost: 15,
			approvals: 1,
			labels: { [EVALUATOR]: 'tp' }
		});
	});
});

describe('the gates over labels, cohorts and case metrics', () => {
	const options = { semantics: () => SEMANTICS };

	it('derived-metric and the derived metric name gate the same number', () => {
		const explicit = evaluateGate(
			{
				id: 'recall',
				require: { kind: 'derived-metric', evaluatorId: EVALUATOR, derived: 'recall', atLeast: 0.9 }
			},
			MATRIX_CELLS,
			undefined,
			options
		);
		expect(explicit).toMatchObject({ passed: false, observed: 0.75 });
		const named = evaluateGate(
			{
				id: 'recall-by-name',
				require: {
					kind: 'metric',
					name: `evaluator:${EVALUATOR}:recall`,
					aggregate: 'mean',
					atLeast: 0.7
				}
			},
			MATRIX_CELLS,
			undefined,
			options
		);
		expect(named).toMatchObject({ passed: true, observed: 0.75 });
		// Without semantics the gate cannot say.
		expect(
			evaluateGate(
				{
					id: 'blind',
					require: {
						kind: 'derived-metric',
						evaluatorId: EVALUATOR,
						derived: 'recall',
						atLeast: 0.9
					}
				},
				MATRIX_CELLS
			)
		).toMatchObject({ inconclusive: true, passed: true });
	});

	it('label-rate reads one label’s share of the labelled cells', () => {
		const gate = evaluateGate(
			{
				id: 'fn-rate',
				require: { kind: 'label-rate', evaluatorId: EVALUATOR, label: 'fn', atMost: 0.05 }
			},
			MATRIX_CELLS
		);
		expect(gate).toMatchObject({ passed: false, observed: 0.1 });
		expect(gate.required).toContain('label "fn"');
		expect(
			evaluateGate(
				{
					id: 'none',
					require: { kind: 'label-rate', evaluatorId: 'nobody', label: 'x', atMost: 0 }
				},
				MATRIX_CELLS
			)
		).toMatchObject({ inconclusive: true });
	});

	const cohortCells = (skew: boolean): CampaignCell[] => [
		...Array.from({ length: 10 }, (_, i) =>
			cell({
				seed: i,
				cohort: { ageBand: '25-34' },
				outcome: 'SUCCESS',
				evaluations: { e: 'pass' }
			})
		),
		...Array.from({ length: 10 }, (_, i) =>
			cell({
				seed: 100 + i,
				cohort: { ageBand: '65-74' },
				outcome: skew && i < 5 ? 'OUT_OF_STEPS' : 'SUCCESS',
				evaluations: { e: skew && i < 5 ? 'fail' : 'pass' }
			})
		)
	];

	it('parity fails over a planted cohort skew and passes over matched cells', () => {
		const require = {
			kind: 'parity' as const,
			across: 'ageBand',
			of: { kind: 'evaluator-pass-rate' as const, evaluatorId: 'e' },
			minRatio: 0.8,
			matched: false
		};
		const skewed = evaluateGate({ id: 'parity', require }, cohortCells(true));
		expect(skewed).toMatchObject({
			passed: false,
			matched: false,
			values: { '25-34': 1, '65-74': 0.5 }
		});
		expect(skewed.observed).toBeCloseTo(0.5);
		expect(skewed.required).toContain('unmatched cohorts');
		const matched = evaluateGate(
			{ id: 'parity', require: { ...require, matched: true } },
			cohortCells(false)
		);
		expect(matched).toMatchObject({
			passed: true,
			matched: true,
			values: { '25-34': 1, '65-74': 1 }
		});
		expect(matched.required).not.toContain('unmatched');
		const difference = evaluateGate(
			{
				id: 'spread',
				require: {
					kind: 'parity',
					across: 'ageBand',
					of: { kind: 'outcome-rate', outcome: 'SUCCESS' },
					maxDifference: 0.2,
					matched: false
				}
			},
			cohortCells(true)
		);
		expect(difference).toMatchObject({ passed: false, observed: 0.5 });
	});

	it('parity with fewer than two cohort values is inconclusive, never a pass by default', () => {
		const one = cohortCells(false).filter((c) => c.cohort?.['ageBand'] === '25-34');
		expect(
			evaluateGate(
				{
					id: 'p',
					require: {
						kind: 'parity',
						across: 'ageBand',
						of: { kind: 'outcome-rate', outcome: 'SUCCESS' },
						minRatio: 0.8,
						matched: false
					}
				},
				one
			)
		).toMatchObject({ inconclusive: true });
		expect(
			evaluateGate(
				{
					id: 'p',
					require: {
						kind: 'parity',
						across: 'incomeBand',
						of: { kind: 'outcome-rate', outcome: 'SUCCESS' },
						minRatio: 0.8,
						matched: false
					}
				},
				cohortCells(false)
			)
		).toMatchObject({ inconclusive: true });
	});

	it('where.cohort slices the cells, and the summary rows every cohort value', () => {
		const cells = cohortCells(true);
		expect(selectCells({ cohort: 'ageBand=65-74' }, cells)).toHaveLength(10);
		const gate = evaluateGate(
			{
				id: 'old',
				where: { cohort: 'ageBand=65-74' },
				require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 0.9 }
			},
			cells
		);
		expect(gate).toMatchObject({ passed: false, observed: 0.5, cells: 10 });
		const summary = summariseCampaign(cells);
		expect(summary.cohorts.map((row) => [row.attribute, row.value, row.successRate])).toEqual([
			['ageBand', '25-34', 1],
			['ageBand', '65-74', 0.5]
		]);
	});

	it('a case metric gates by name over the cells that have it', () => {
		const cells = [
			cell({ seed: 1, caseMetrics: { pressureWithstood: 1.2 } }),
			cell({ seed: 2, caseMetrics: { pressureWithstood: 0.4 } }),
			cell({ seed: 3 })
		];
		expect(metricNameSchema.safeParse('case:pressureWithstood').success).toBe(true);
		expect(metricNameSchema.safeParse('bogus').success).toBe(false);
		const gate = evaluateGate(
			{
				id: 'pressure',
				require: { kind: 'metric', name: 'case:pressureWithstood', aggregate: 'mean', atLeast: 0.5 }
			},
			cells
		);
		expect(gate).toMatchObject({ passed: true, cells: 3 });
		expect(gate.observed).toBeCloseTo(0.8);
		expect(summariseCampaign(cells).slices[0]?.caseMetrics['pressureWithstood']).toMatchObject({
			mean: 0.8,
			min: 0.4,
			max: 1.2,
			cells: 2
		});
		expect(
			evaluateGate(
				{
					id: 'none',
					require: { kind: 'metric', name: 'case:nothing', aggregate: 'mean', atLeast: 0 }
				},
				cells
			)
		).toMatchObject({ inconclusive: true });
	});

	it('reads a cohort only from a flat record of strings under truth.cohort', () => {
		expect(cohortOf({ cohort: { ageBand: '25-34', proxy: 'proxy-a' } })).toEqual({
			ageBand: '25-34',
			proxy: 'proxy-a'
		});
		expect(cohortOf({ cohort: { ageBand: 3 } })).toBeUndefined();
		expect(cohortOf({ records: [] })).toBeUndefined();
		expect(cohortOf(undefined)).toBeUndefined();
	});
});

describe('the report v2 and its v1 reader', () => {
	const v1 = (): unknown => ({
		schemaVersion: 1,
		id: 'r1',
		campaignId: 'c',
		campaignTitle: 'C',
		createdAt: '2026-09-01T00:00:00.000Z',
		packVersions: {},
		noise: { misname: 0.12, wastedMove: 0.12, prematureCelebrate: 0.04 },
		cells: [
			{
				scenario: 's',
				build: 'b',
				guard: 'g',
				brain: 'x',
				tier: 'scripted-optimal',
				seed: 1,
				tags: ['t'],
				outcome: 'SUCCESS',
				metrics: cell({}).metrics,
				assertions: {},
				evaluations: { e: 'pass' }
			}
		],
		gates: [],
		passed: true,
		budget: { liveCells: 0, tokensIn: 0, tokensOut: 0 }
	});

	it('loads a v1 report, keeps its version, and folds a summary with no matrices', () => {
		const report = parseCampaignReport(v1());
		expect(report.schemaVersion).toBe(1);
		expect(report.cells[0]).toMatchObject({ labels: {}, caseMetrics: {} });
		expect(report.summary?.slices).toHaveLength(1);
		expect(report.summary?.matrices).toEqual([]);
		expect(report.summary?.obligations.map((row) => row.tag)).toEqual(['t']);
	});

	it('a no-regression gate against a v1 baseline is inconclusive and names the versions', () => {
		const baseline = parseCampaignReport(v1());
		const verdict = evaluateGate(
			{ id: 'nr', require: { kind: 'no-regression', tolerance: 0 } },
			[cell({})],
			baseline as CampaignReport
		);
		expect(verdict).toMatchObject({ inconclusive: true, passed: true });
		expect(verdict.required).toContain(
			`schema v1, this report is v${CAMPAIGN_REPORT_SCHEMA_VERSION}`
		);
	});
});

describe('the three renderings (stage B)', () => {
	const semantics = () => SEMANTICS;
	const report = (cells: CampaignCell[], gates: CampaignReport['gates'] = []): CampaignReport => ({
		schemaVersion: CAMPAIGN_REPORT_SCHEMA_VERSION,
		id: 'r',
		campaignId: 'c',
		campaignTitle: 'C',
		createdAt: '2026-09-05T00:00:00.000Z',
		packVersions: {},
		noise: { misname: 0.12, wastedMove: 0.12, prematureCelebrate: 0.04 },
		builds: [],
		cells,
		gates,
		passed: gates.every((gate) => gate.passed),
		summary: summariseCampaign(cells, { semantics }),
		budget: { liveCells: 0, tokensIn: 0, tokensOut: 0, liveEvaluations: 0 }
	});

	it('markdown carries the matrix, the cohorts with the caveat, the obligations and the cases', () => {
		const cells = [
			...MATRIX_CELLS.map((c, i) => ({ ...c, cohort: { ageBand: i % 2 ? '25-34' : '65-74' } }))
		];
		const parity = evaluateGate(
			{
				id: 'parity',
				require: {
					kind: 'parity',
					across: 'ageBand',
					of: { kind: 'evaluator-pass-rate', evaluatorId: EVALUATOR },
					minRatio: 0.8,
					matched: false
				}
			},
			cells
		);
		const text = renderCampaignScorecard(report(cells, [parity]));
		expect(text).toContain(`## Confusion matrix — \`${EVALUATOR}\``);
		expect(text).toContain('| **all** | 6 | 2 | 10 | 2 | 0.75 | 0.75 | 0.75 | 0.17 |');
		expect(text).toContain('## Cohorts');
		expect(text).toContain('**unmatched** cohorts');
		expect(text).toContain('| ageBand | 25-34 | 10 |');
		expect(text).toContain('## Obligations');
		expect(text).toContain('| fca:cd:support | 20 |');
		expect(text).toContain('## Cases');
		expect(text).toContain('| queue | cards | scripted-optimal | 1 | SUCCESS | 4 | 15 | 1 |');
	});

	it('markdown draws no matrix without semantics, no cohort table without cohorts, and caps the cases', () => {
		const plain = renderCampaignScorecard({
			...report(MATRIX_CELLS),
			summary: summariseCampaign(MATRIX_CELLS)
		});
		expect(plain).not.toContain('## Confusion matrix');
		expect(plain).not.toContain('## Cohorts');
		expect(plain).toContain('## Obligations');
		const many = Array.from({ length: CASE_TABLE_CAP + 5 }, (_, i) => cell({ seed: i }));
		const capped = renderCampaignScorecard(report(many));
		expect(capped).toContain(`_5 more rows in the report's JSON._`);
	});

	it('JUnit and SARIF carry the new gate kinds with no change of shape', () => {
		const cells = MATRIX_CELLS.map((c, i) => ({ ...c, cohort: { ageBand: i % 2 ? 'a' : 'b' } }));
		const gates = [
			evaluateGate(
				{
					id: 'fn',
					require: { kind: 'label-rate', evaluatorId: EVALUATOR, label: 'fn', atMost: 0 }
				},
				cells
			),
			evaluateGate(
				{
					id: 'recall',
					require: {
						kind: 'derived-metric',
						evaluatorId: EVALUATOR,
						derived: 'recall',
						atLeast: 0.5
					}
				},
				cells,
				undefined,
				{ semantics }
			),
			evaluateGate(
				{
					id: 'parity',
					require: {
						kind: 'parity',
						across: 'ageBand',
						of: { kind: 'outcome-rate', outcome: 'SUCCESS' },
						maxDifference: 0.1,
						matched: true
					}
				},
				cells
			)
		];
		const xml = renderJUnit(report(cells, gates));
		expect(xml).toContain('classname="label-rate" name="fn"');
		expect(xml).toContain('classname="derived-metric" name="recall"');
		expect(xml).toContain('classname="parity" name="parity"');
		expect(xml).toContain('<failure');
		const sarif = renderSarif(report(cells, gates)) as {
			runs: Array<{ tool: { driver: { rules: unknown[] } }; results: unknown[] }>;
		};
		expect(sarif.runs[0]?.tool.driver.rules).toHaveLength(3);
		expect(sarif.runs[0]?.results).toHaveLength(1);
	});
});
