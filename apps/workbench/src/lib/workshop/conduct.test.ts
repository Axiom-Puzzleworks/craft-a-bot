import type { WorkflowSpec } from '@craftabot/core';
import type { CampaignCell, CampaignReport } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';
import {
	KYC_EVALUATOR,
	TIPPING_OFF_EVALUATOR,
	VULNERABILITY_EVALUATOR,
	conductFold,
	governingStage,
	lampOf,
	slugOf,
	vulnerabilityCellOf,
	workflowIdOfCell
} from './conduct.js';

/**
 * The Conduct fold (WP88, `79-…` §3): the four outcomes first with the
 * report's own rows and the cases behind them; vulnerability as recognised ×
 * acted on with `not-applicable` outside the 2×2; DISP, tipping-off and KYC
 * as pass rates over the cells they applied to; the governing stage from
 * the workflow's stages.
 */
const cell = (over: Partial<CampaignCell> & { scenario: string }): CampaignCell =>
	({
		build: 'b',
		guard: 'none',
		brain: 'scripted-optimal',
		seed: 1,
		outcome: 'SUCCESS',
		metrics: {},
		assertions: {},
		evaluations: {},
		labels: {},
		caseMetrics: {},
		tags: [],
		...over
	}) as unknown as CampaignCell;

const report: CampaignReport = {
	cells: [
		cell({
			scenario: 'a',
			tags: ['fca:cd:support', 'fca:fg21-1:vulnerability'],
			evaluations: { [VULNERABILITY_EVALUATOR]: 'pass', [TIPPING_OFF_EVALUATOR]: 'pass' },
			labels: {},
			workflow: { runId: 'wf-a' } as never
		}),
		cell({
			scenario: 'b',
			tags: ['fca:cd:support'],
			outcome: 'STOPPED_BY_GUARDRAIL',
			evaluations: { [VULNERABILITY_EVALUATOR]: 'fail', [KYC_EVALUATOR]: 'fail' },
			labels: {}
		}),
		cell({
			scenario: 'c',
			tags: ['poca:tipping-off'],
			evaluations: {
				[VULNERABILITY_EVALUATOR]: 'pass',
				[TIPPING_OFF_EVALUATOR]: 'pass',
				[KYC_EVALUATOR]: 'pass',
				'fs-advice/complaint-acknowledged': 'pass'
			},
			labels: { [VULNERABILITY_EVALUATOR]: 'not-applicable' }
		})
	],
	summary: {
		obligations: [
			{ tag: 'fca:cd:support', cells: 2, successRate: 0.5, evaluatorPassRates: {}, labels: {} }
		]
	} as never
} as unknown as CampaignReport;

const workflow = {
	stages: [
		{ id: 'intake', obligations: [] },
		{ id: 'contact', obligations: ['poca:tipping-off'] },
		{ id: 'decision' }
	]
} as unknown as WorkflowSpec;

describe('conductFold', () => {
	it('lists the four outcomes first, each with the report’s row and its cases, then the other obligations', () => {
		const fold = conductFold(report, new Map([['w', workflow]]), { workflowIdOfCell: () => 'w' });
		expect(fold.outcomes.slice(0, 4).map((outcome) => outcome.tag)).toEqual([
			'fca:cd:products-services',
			'fca:cd:price-value',
			'fca:cd:understanding',
			'fca:cd:support'
		]);
		expect(fold.outcomes.map((outcome) => outcome.tag).slice(4)).toEqual([
			'fca:fg21-1:vulnerability',
			'poca:tipping-off'
		]);
		const support = fold.outcomes.find((outcome) => outcome.tag === 'fca:cd:support')!;
		expect(support.row?.successRate).toBe(0.5);
		expect(support.cases.map((entry) => entry.scenario)).toEqual(['a', 'b']);
		expect(support.failing).toBe(1);
		expect(support.cases[0]?.workflowRunId).toBe('wf-a');
		expect(support.cases[0]?.stageId).toBe('intake');
		const tipping = fold.outcomes.find((outcome) => outcome.tag === 'poca:tipping-off')!;
		expect(tipping.cases[0]?.stageId).toBe('contact');
		expect(tipping.cases[0]?.failed).toEqual([]);
		expect(support.cases[1]?.failed).toEqual([VULNERABILITY_EVALUATOR, KYC_EVALUATOR]);
	});

	it('folds vulnerability as recognised × acted on, and the pass rates over the cells they applied to', () => {
		const fold = conductFold(report);
		expect(fold.vulnerability).toEqual({
			recognisedActed: 1,
			recognisedMissed: 1,
			notRecognised: 1,
			total: 3
		});
		expect(fold.tippingOff).toMatchObject({ value: 1, n: 2 });
		expect(fold.kyc).toMatchObject({ value: 0.5, n: 2 });
		expect(fold.kyc?.interval[0]).toBeLessThan(0.5);
		expect(fold.disp.map((row) => row.evaluatorId)).toEqual(['fs-advice/complaint-acknowledged']);
		expect(fold.disp[0]?.rate.value).toBe(1);
	});

	it('names the governing stage, the first stage when none names the tag, and nothing without a workflow', () => {
		expect(governingStage(workflow, 'poca:tipping-off')).toBe('contact');
		expect(governingStage(workflow, 'fca:cd:support')).toBe('intake');
		expect(governingStage(undefined, 'x')).toBeUndefined();
	});

	it('finds a book cell’s workflow by the stages it ran, lights a lamp by the rate, and slugs a tag', () => {
		const workflows = new Map([['w', workflow]]);
		const ran = cell({
			scenario: 'd',
			workflow: { runId: 'r', stages: [{ stageId: 'contact' }, { stageId: 'decision' }] } as never
		});
		expect(workflowIdOfCell(ran, workflows)).toBe('w');
		expect(
			workflowIdOfCell(
				cell({
					scenario: 'e',
					workflow: { runId: 'r', stages: [{ stageId: 'nowhere' }] } as never
				}),
				workflows
			)
		).toBeUndefined();
		expect(workflowIdOfCell(cell({ scenario: 'f' }), workflows)).toBeUndefined();
		expect(lampOf(undefined)).toBe('inconclusive');
		expect(lampOf({ value: 1, interval: [0.5, 1], n: 3 })).toBe('pass');
		expect(lampOf({ value: 0.5, interval: [0.1, 0.9], n: 2 })).toBe('fail');
		expect(slugOf('fca:cd:price-value')).toBe('fca-cd-price-value');
		const v = { recognisedActed: 2, recognisedMissed: 1, notRecognised: 1, total: 4 };
		expect(vulnerabilityCellOf(v, 'recognised', 'acted')).toEqual({ value: 0.5, label: '2' });
		expect(vulnerabilityCellOf(v, 'recognised', 'missed')).toEqual({ value: 0.25, label: '1' });
		expect(vulnerabilityCellOf(v, 'not-recognised', 'missed').note).toBe('nothing disclosed');
		expect(vulnerabilityCellOf(v, 'not-recognised', 'acted').label).toBe('—');
		expect(vulnerabilityCellOf({ ...v, total: 0 }, 'recognised', 'acted').value).toBe(0);
	});
});
