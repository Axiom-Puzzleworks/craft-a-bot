import { describe, expect, it } from 'vitest';
import { renderJUnit } from './campaign-junit.js';
import { renderSarif } from './campaign-sarif.js';
import { renderCampaignScorecard } from './campaign-scorecard.js';
import { driftRowsOf, fairnessRowsOf, summariseCampaign } from './campaign-summary.js';
import {
	CAMPAIGN_REPORT_SCHEMA_VERSION,
	evaluateGate,
	gateSchema,
	parseCampaignReport,
	type CampaignCell,
	type CampaignReport
} from './campaign.js';

/**
 * **The gates and report v3** (WP82, `74-GATES-AND-REPORT-V3.md`; `64-…`
 * §6.4.4): a `parity` gate with a metric carries its interval, *n* and
 * power — inconclusive over twelve cells when power is required, a verdict
 * over twelve hundred; a `drift` gate against a fixed baseline; a v2 report
 * reads as v3 with the panes empty and a reason; JUnit and SARIF unchanged
 * in shape.
 */
const cell = (over: Partial<CampaignCell>): CampaignCell => ({
	scenario: 's',
	build: 'b',
	guard: 'none',
	brain: 'scripted-optimal',
	tier: 'scripted-optimal',
	seed: 1,
	tags: [],
	outcome: 'SUCCESS',
	metrics: {
		outcome: 'SUCCESS',
		ticksUsed: 3,
		tokensIn: 10,
		tokensOut: 5,
		loop: { longestStreak: 1, repeatedFailures: 0 },
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
});

/** `n` decided cells across two age bands, the younger approved at `young`, the older at `old`. */
function decided(n: number, young: number, old: number): CampaignCell[] {
	const cells: CampaignCell[] = [];
	for (let i = 0; i < n; i += 1) {
		const band = i % 2 === 0 ? '25-34' : '65-74';
		const rate = band === '25-34' ? young : old;
		const approve = ((i * 7919) % 100) / 100 < rate;
		cells.push(
			cell({
				seed: i,
				cohort: { ageBand: band },
				decision: { outcome: approve ? 'approve' : 'decline', verdict: 'approve' }
			})
		);
	}
	return cells;
}

const parity = (over: Record<string, unknown>) =>
	gateSchema.parse({
		id: 'dp',
		require: {
			kind: 'parity',
			across: 'ageBand',
			metric: 'demographic-parity',
			maxDifference: 0.1,
			...over
		}
	});

describe('a parity gate with a metric', () => {
	it('carries the interval, n, method and power; power required makes twelve cells inconclusive and twelve hundred a verdict', () => {
		const twelve = evaluateGate(parity({ power: 'required' }), decided(12, 0.7, 0.5));
		expect(twelve.inconclusive).toBe(true);
		expect(twelve.underpowered).toBe(true);
		expect(twelve.n).toBe(12);
		expect(twelve.reason).toContain('underpowered');
		expect(twelve.interval).toHaveLength(2);
		const many = evaluateGate(parity({ power: 'required' }), decided(1200, 0.7, 0.5));
		expect(many.inconclusive).toBeUndefined();
		expect(many.underpowered).toBe(false);
		expect(many.n).toBe(1200);
		expect(many.passed).toBe(false);
		expect(many.observed).toBeGreaterThan(0.1);
		expect(many.interval?.[0]).toBeLessThan(many.observed as number);
		expect(many.method).toContain('newcombe');
		// Reported power: twelve cells still judge, and say they are underpowered.
		const reported = evaluateGate(parity({}), decided(12, 0.7, 0.5));
		expect(reported.inconclusive).toBeUndefined();
		expect(reported.underpowered).toBe(true);
		// The same rates: passes.
		expect(evaluateGate(parity({}), decided(400, 0.6, 0.6)).passed).toBe(true);
	});

	it('the four-fifths rule as disparate impact with a ratio, a stratified metric, and the flip refused', () => {
		const ratio = evaluateGate(
			parity({ metric: 'disparate-impact', minRatio: 0.8 }),
			decided(600, 0.8, 0.4)
		);
		expect(ratio.passed).toBe(false);
		expect(ratio.observed).toBeCloseTo(0.5, 1);
		const stratified = evaluateGate(
			parity({ metric: 'conditional-parity', stratify: 'incomeBand' }),
			decided(200, 0.6, 0.6).map((c, i) => ({
				...c,
				cohort: { ...c.cohort, incomeBand: i % 3 === 0 ? 'a' : 'b' }
			}))
		);
		expect(stratified.required).toContain('within incomeBand');
		expect(stratified.n).toBe(200);
		const flip = evaluateGate(parity({ metric: 'counterfactual-flip' }), decided(50, 0.5, 0.5));
		expect(flip.inconclusive).toBe(true);
		expect(flip.reason).toContain('fork');
		// Fewer than two cohorts: inconclusive with the reason.
		const one = evaluateGate(
			parity({}),
			decided(50, 0.5, 0.5).map((c) => ({ ...c, cohort: { ageBand: 'x' } }))
		);
		expect(one.inconclusive).toBe(true);
		expect(one.reason).toContain('fewer than two cohorts');
	});

	it('the gate schema wants a metric or an of', () => {
		expect(() =>
			gateSchema.parse({ id: 'p', require: { kind: 'parity', across: 'ageBand' } })
		).toThrow(/metric/);
	});
});

const baselineReport = (cells: CampaignCell[]): CampaignReport => ({
	schemaVersion: CAMPAIGN_REPORT_SCHEMA_VERSION,
	id: 'baseline-1',
	campaignId: 'c',
	campaignTitle: 'c',
	createdAt: '2026-09-11T00:00:00.000Z',
	packVersions: {},
	noise: { misname: 0, wastedMove: 0, prematureCelebrate: 0 },
	builds: [],
	cells,
	gates: [],
	passed: true,
	summary: summariseCampaign(cells),
	budget: { liveCells: 0, tokensIn: 0, tokensOut: 0, liveEvaluations: 0 }
});

describe('a drift gate', () => {
	const drift = (over: Record<string, unknown>) =>
		gateSchema.parse({
			id: 'd',
			require: {
				kind: 'drift',
				metric: 'outcome-mix',
				reference: { kind: 'fixed' },
				atMost: 0.1,
				...over
			}
		});

	it('against a fixed baseline: the outcome mix, agreement, psi over a cohort attribute; and says why it cannot', () => {
		const reference = decided(400, 0.6, 0.6);
		const same = evaluateGate(drift({}), decided(400, 0.6, 0.6), baselineReport(reference));
		expect(same.passed).toBe(true);
		expect(same.observed).toBe(0);
		const moved = evaluateGate(drift({}), decided(400, 0.95, 0.95), baselineReport(reference));
		expect(moved.passed).toBe(false);
		expect(moved.observed).toBeGreaterThan(0.1);
		expect(moved.method).toContain('total-variation');
		const agreement = evaluateGate(
			drift({ metric: 'agreement', atMost: 0.05 }),
			decided(400, 0.95, 0.95),
			baselineReport(reference)
		);
		expect(agreement.passed).toBe(false);
		expect(agreement.method).toContain('newcombe');
		const psi = evaluateGate(
			drift({ metric: 'psi', feature: 'ageBand', atMost: 0.1 }),
			decided(400, 0.6, 0.6),
			baselineReport(reference)
		);
		expect(psi.passed).toBe(true);
		expect(psi.observed).toBe(0);
		expect(evaluateGate(drift({}), decided(10, 0.6, 0.6)).reason).toContain('no baseline');
		expect(
			evaluateGate(
				drift({ reference: { kind: 'fixed', reportId: 'other' } }),
				decided(10, 0.6, 0.6),
				baselineReport(reference)
			).reason
		).toContain('not other');
		expect(
			evaluateGate(drift({ reference: { kind: 'rolling', days: 7 } }), decided(10, 0.6, 0.6)).reason
		).toContain('rolling');
		expect(
			evaluateGate(drift({ reference: { kind: 'population' } }), decided(10, 0.6, 0.6)).reason
		).toContain('book');
		expect(
			evaluateGate(drift({ metric: 'psi' }), decided(10, 0.6, 0.6), baselineReport(reference))
				.reason
		).toContain('feature');
		expect(
			evaluateGate(
				drift({ metric: 'ks', feature: 'ticks' }),
				decided(10, 0.6, 0.6),
				baselineReport(reference)
			).reason
		).toContain('case metric');
		expect(
			evaluateGate(drift({ metric: 'fairness' }), decided(10, 0.6, 0.6), baselineReport(reference))
				.reason
		).toContain('name the metric');
		const fairness = evaluateGate(
			drift({ metric: 'fairness', feature: 'demographic-parity', atMost: 0.05 }),
			decided(400, 0.9, 0.5),
			baselineReport(reference)
		);
		expect(fairness.passed).toBe(false);
	});
});

describe('the report v3', () => {
	it('a v2 report reads with the v3 panes empty and keeps its version; the summary rows come off the verdicts', () => {
		const cells = decided(80, 0.6, 0.6);
		const v2 = { ...baselineReport(cells), schemaVersion: 2 as const, summary: undefined };
		const read = parseCampaignReport(JSON.parse(JSON.stringify(v2)));
		// It keeps its version (WP61's rule), and reads with the v3 panes empty.
		expect(read.schemaVersion).toBe(2);
		expect(read.summary?.fairness).toEqual([]);
		expect(read.summary?.drift).toEqual([]);
		const scorecard = renderCampaignScorecard(read);
		expect(scorecard).toContain('written at schema v2');
		const gates = [
			evaluateGate(parity({}), cells),
			evaluateGate(
				gateSchema.parse({
					id: 'd',
					require: {
						kind: 'drift',
						metric: 'outcome-mix',
						reference: { kind: 'fixed' },
						atMost: 0.1
					}
				}),
				cells,
				baselineReport(cells)
			)
		];
		const rows = fairnessRowsOf(gates);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({
			gateId: 'dp',
			metric: 'demographic-parity',
			across: 'ageBand',
			n: 80,
			underpowered: false
		});
		const drift = driftRowsOf(gates);
		expect(drift).toHaveLength(1);
		expect(drift[0]).toMatchObject({
			gateId: 'd',
			metric: 'outcome-mix',
			reference: 'fixed',
			flagged: false,
			atMost: 0.1
		});
		const v3: CampaignReport = {
			...baselineReport(cells),
			gates,
			summary: summariseCampaign(cells, { gates })
		};
		const rendered = renderCampaignScorecard(v3);
		expect(rendered).toContain('## Fairness');
		expect(rendered).toContain('## Drift');
		// JUnit and SARIF keep their shape: a gate is a testcase or a result, whatever its statistics.
		expect(renderJUnit(v3)).toContain('<testcase classname="parity" name="dp"');
		expect(renderSarif(v3).runs[0]?.results.length).toBe(gates.filter((g) => !g.passed).length);
	});
});
