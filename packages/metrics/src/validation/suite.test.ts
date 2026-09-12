import { describe, expect, it } from 'vitest';
import { handCases, renderValidationReport, validationReport } from './suite.js';
import { demographicParity, disparateImpact, matchedPairDiscordance } from '../fairness.js';
import { clopperPearson, newcombe, wilson } from '../intervals.js';
import { twoProportionZ } from '../tests.js';

/**
 * **Every metric's three tests** (WP76, `68-METRICS.md` §4; `65-…` WP76's
 * DoD): the suite runs the hand case, the planted effect and the null for
 * every metric and returns them as data; this test asserts each row is
 * green, so a metric that stops recovering its planted effect or starts
 * flagging its null fails here before it reaches a screen.
 */
const report = validationReport({ seeds: 200, n: 2000 });

describe('the validation suite', () => {
	it('covers every metric family', () => {
		expect(report.rows.map((row) => row.metric).sort()).toEqual(
			[
				'agreement',
				'ceiling-breach-rate',
				'conditional-parity',
				'counterfactual-flip',
				'demographic-parity',
				'discordance',
				'disparate-impact',
				'equal-opportunity',
				'equalised-odds',
				'fairness',
				'ks',
				'outcome-mix',
				'page-hinkley',
				'predictive-parity',
				'psi',
				'rule-agreement',
				'touches-per-case',
				'unattended-rate'
			].sort()
		);
	});

	for (const row of report.rows) {
		it(`${row.metric}: the hand case, the planted effect and the null`, () => {
			expect(row.hand, 'hand case').toMatchObject({ ok: true });
			expect(row.planted, 'planted effect').toMatchObject({ ok: true });
			expect(row.null, 'null').toMatchObject({ ok: true });
		});
	}

	it('renders as the page docs/metrics.md is generated from', () => {
		const text = renderValidationReport(report);
		expect(text).toContain('# Metrics: definitions and validation');
		expect(text).toContain('`demographic-parity`');
		expect(text).not.toContain('❌');
	});
});

describe('the hand case, worked as 68-METRICS.md §3.2 works it', () => {
	const hand = handCases();
	it('demographic parity: 0.70 − 0.40 = 0.30, Newcombe [−0.118, 0.601], z p = 0.178, underpowered', () => {
		const result = demographicParity(hand);
		expect(result.value).toBeCloseTo(0.3, 6);
		expect(result.rates).toEqual({ a: 0.7, b: 0.4 });
		expect(result.n).toEqual({ a: 10, b: 10 });
		expect(result.interval[0]).toBeCloseTo(-0.118, 2);
		expect(result.interval[1]).toBeCloseTo(0.601, 2);
		expect(result.underpowered).toBe(true);
		// Under the floor the test is Fisher's; the z test the note works by hand is checked directly.
		expect(result.test).toBe('fisher-exact');
		expect(twoProportionZ(7, 10, 4, 10).p).toBeCloseTo(0.178, 2);
	});

	it('disparate impact: 0.40 / 0.70 = 0.571, log-ratio [0.242, 1.351]', () => {
		const result = disparateImpact(hand);
		expect(result.value).toBeCloseTo(4 / 7, 6);
		expect(result.interval[0]).toBeCloseTo(0.242, 2);
		expect(result.interval[1]).toBeCloseTo(1.351, 2);
	});

	it('the intervals: Wilson 7/10 [0.3968, 0.8922], Clopper–Pearson 3/10 [0.0667, 0.6525]', () => {
		const [lo, hi] = wilson(7, 10);
		expect(lo).toBeCloseTo(0.3968, 3);
		expect(hi).toBeCloseTo(0.8922, 3);
		expect(wilson(0, 0)).toEqual([0, 1]);
		const [cl, ch] = clopperPearson(3, 10);
		expect(cl).toBeCloseTo(0.0667, 3);
		expect(ch).toBeCloseTo(0.6525, 3);
		expect(newcombe(7, 10, 4, 10)[0]).toBeCloseTo(-0.118, 2);
	});

	it('discordance: three of ten pairs, two favouring a → 0.30, sign p = 1', () => {
		const pairs = Array.from({ length: 10 }, (_, i) => {
			const differ = i < 3;
			return [
				{
					group: 'a',
					decision: differ ? (i < 2 ? 'approve' : 'decline') : 'approve',
					pairId: `p${i}`
				},
				{
					group: 'b',
					decision: differ ? (i < 2 ? 'decline' : 'approve') : 'approve',
					pairId: `p${i}`
				}
			] as const;
		}).flat();
		const result = matchedPairDiscordance([...pairs]);
		expect(result.value).toBeCloseTo(0.3, 6);
		expect(result.n).toEqual({ pairs: 10, discordant: 3 });
		expect(result.p).toBe(1);
		expect(result.detail).toEqual({ favourFirst: 2, favourSecond: 1 });
	});
});
