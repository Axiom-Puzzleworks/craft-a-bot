import type { StoredWorkflowRun } from '@craftabot/core';
import type { CampaignCell, CampaignReport } from '@craftabot/evals';
import { describe, expect, it } from 'vitest';
import {
	agreementOverTime,
	counterfactualFlips,
	decidedCasesOf,
	decisionOfStoredRun,
	detector,
	driftWorkbench,
	fairnessWorkbench,
	hazardBaseRate,
	lampOfDetector,
	lampOfPsi,
	windowOf
} from './model-risk.js';

/**
 * The Model-risk fold (WP88, `79-…` §4): the fairness rows over a report's
 * cells; the counterfactual flip rate over twenty forks held to a hand
 * count; PSI per feature against a reference; rule agreement over time;
 * the synthetic hazard's base rate; the detector over a series.
 */
const cell = (
	group: string,
	outcome: 'approve' | 'decline' | 'refer',
	verdict: 'approve' | 'decline' | 'refer',
	repaid?: boolean
): CampaignCell =>
	({
		scenario: 's',
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
		cohort: { ageBand: group, incomeBand: group === 'a' ? 'low' : 'high' },
		decision: { outcome, verdict, ...(repaid !== undefined ? { repaid } : {}) }
	}) as unknown as CampaignCell;

const cells: CampaignCell[] = [
	...Array.from({ length: 40 }, (_, i) =>
		cell('a', i < 28 ? 'approve' : 'decline', i < 28 ? 'approve' : 'decline', i % 5 !== 0)
	),
	...Array.from({ length: 40 }, (_, i) =>
		cell('b', i < 16 ? 'approve' : 'decline', i < 20 ? 'approve' : 'decline', i % 3 !== 0)
	)
];
const report = { cells, gates: [] } as unknown as CampaignReport;

const storedRun = (
	id: string,
	outcome: string | undefined,
	forkedFrom?: string
): StoredWorkflowRun => ({
	run: {
		schemaVersion: 1,
		id,
		workflowId: 'w',
		itemId: 'i',
		config: {},
		startedAt: '2026-01-05T09:00:00.000Z',
		finishedAt: '2026-01-05T09:00:00.000Z',
		outcome: 'completed',
		stages:
			outcome === undefined
				? []
				: [
						{
							stageId: 'record',
							executor: { kind: 'rule', rule: 'r' },
							startedTick: 0,
							endedTick: 0,
							durationMs: 0,
							input: { digest: 'd' },
							output: { digest: 'd', value: { outcome } },
							guards: { checked: 0, tripped: [] },
							status: 'ok'
						}
					],
		runIds: [],
		events: [],
		digest: 'x'
	},
	...(forkedFrom ? { forkedFrom: { runId: forkedFrom, stageId: 'record' } } : {}),
	createdAt: '2026-09-11T09:00:00.000Z',
	schemaVersion: 1
});

describe('the Model-risk fold', () => {
	it('folds the fairness rows over the cells across an attribute, and says why a metric has no reading', () => {
		const bench = fairnessWorkbench(report, { across: 'ageBand' });
		expect(bench.cases).toBe(80);
		expect(bench.groups).toEqual(['a', 'b']);
		const parity = bench.rows.find((row) => row.metric === 'demographic-parity');
		expect(parity?.result?.value).toBeCloseTo(0.7 - 0.4, 6);
		expect(parity?.result?.n).toEqual({ a: 40, b: 40 });
		expect(bench.matched.reason).toContain('no matched pairs');
		const windowed = fairnessWorkbench(report, { across: 'ageBand', window: 10 });
		expect(windowed.cases).toBe(10);
		expect(windowed.rows[0]?.reason).toContain('fewer than two cohorts');
		expect(decidedCasesOf(cells, 'ageBand', 'incomeBand')[0]?.stratum).toBe('low');
	});

	it('counts the counterfactual flips over twenty forks as a hand count does', () => {
		const originals = Array.from({ length: 20 }, (_, i) =>
			storedRun(`o${i}`, i % 2 === 0 ? 'approve' : 'decline')
		);
		// Seven forks change the decision; thirteen keep it; one fork's original is missing; one fork never decided.
		const forks = Array.from({ length: 20 }, (_, i) =>
			storedRun(
				`f${i}`,
				i < 7 ? (i % 2 === 0 ? 'decline' : 'approve') : i % 2 === 0 ? 'approve' : 'decline',
				`o${i}`
			)
		);
		const orphan = storedRun('f-orphan', 'approve', 'nowhere');
		const undecided = storedRun('f-none', undefined, 'o0');
		const fold = counterfactualFlips([...originals, ...forks, orphan, undecided]);
		expect(fold.forks).toBe(22);
		expect(fold.compared).toBe(20);
		expect(fold.changed).toBe(7);
		expect(fold.result?.value).toBeCloseTo(7 / 20, 6);
		expect(counterfactualFlips(originals).reason).toContain('no forks yet');
		expect(decisionOfStoredRun(originals[0]!.run)).toBe('approve');
	});

	it('reads PSI per feature against a reference, agreement over time, the hazard base rate and the detector', () => {
		const reference = { cells: cells.slice(0, 40), gates: [] } as unknown as CampaignReport;
		const drift = driftWorkbench(report, reference);
		expect(drift.map((row) => row.feature)).toEqual(['ageBand', 'incomeBand', 'decision']);
		expect(drift[0]?.psi?.value).toBeGreaterThan(0);
		expect(driftWorkbench(report, undefined)[0]?.reason).toContain('choose a reference');
		const over = agreementOverTime(
			[
				{
					stored: { id: 'r2', title: 'later', createdAt: '2026-09-11T10:00:00.000Z' } as never,
					report
				},
				{
					stored: { id: 'r1', title: 'earlier', createdAt: '2026-09-11T09:00:00.000Z' } as never,
					report: reference
				}
			],
			'ageBand'
		);
		expect(over.map((point) => point.reportId)).toEqual(['r1', 'r2']);
		// rule agreement is the spread of P(decision = verdict) across groups: one group spreads nothing; a 1.0 against b 0.9.
		expect(over[0]?.value).toBe(0);
		expect(over[1]?.value).toBeCloseTo(0.1, 6);
		const hazard = hazardBaseRate(cells)!;
		expect(hazard.n).toBe(80);
		expect(hazard.value).toBeCloseTo((8 + 14) / 80, 6);
		expect(hazardBaseRate([])).toBeUndefined();
		expect(detector([1, 2])).toBeUndefined();
		expect(detector([0.5, 0.5, 0.5, 0.9, 0.9, 0.9])?.metric).toBe('page-hinkley');
	});

	it('lights the lamps by the reading and reads the window field', () => {
		expect(lampOfPsi(undefined)).toBe('inconclusive');
		expect(lampOfPsi({ reading: 'stable' } as never)).toBe('pass');
		expect(lampOfPsi({ reading: 'act' } as never)).toBe('fail');
		expect(lampOfDetector(undefined)).toBe('inconclusive');
		expect(lampOfDetector({ detectedAt: undefined } as never)).toBe('pass');
		expect(lampOfDetector({ detectedAt: 4 } as never)).toBe('fail');
		expect(windowOf('')).toBeUndefined();
		expect(windowOf('0')).toBeUndefined();
		expect(windowOf('12')).toBe(12);
	});
});
