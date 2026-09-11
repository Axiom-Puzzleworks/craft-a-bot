import { describe, expect, it } from 'vitest';
import { betaInc, normalCdf, normalQuantile, tQuantile } from './normal.js';
import { meanInterval, welch } from './intervals.js';
import { fisherExact, kolmogorovQ, ksTwoSample, signTest } from './tests.js';

/**
 * The distributions against tabulated values (`68-METRICS.md` §3.5), so
 * every interval and test above rests on arithmetic a reader can check
 * in a statistics table.
 */
describe('the normal distribution', () => {
	it('Φ and Φ⁻¹ agree with the table', () => {
		expect(normalCdf(0)).toBeCloseTo(0.5, 6);
		expect(normalCdf(1.959964)).toBeCloseTo(0.975, 6);
		expect(normalCdf(-1)).toBeCloseTo(0.158655, 5);
		expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
		expect(normalQuantile(0.5)).toBeCloseTo(0, 7);
		expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 4);
		expect(() => normalQuantile(2)).toThrow(RangeError);
	});
});

describe('the incomplete beta and the t distribution', () => {
	it('I_x(a, b) at known points', () => {
		expect(betaInc(1, 1, 0.3)).toBeCloseTo(0.3, 9);
		expect(betaInc(2, 3, 0.5)).toBeCloseTo(0.6875, 6);
		expect(betaInc(0.5, 0.5, 0.5)).toBeCloseTo(0.5, 6);
	});

	it('t quantiles agree with the table', () => {
		expect(tQuantile(0.975, 5)).toBeCloseTo(2.571, 3);
		expect(tQuantile(0.975, 30)).toBeCloseTo(2.042, 3);
		expect(tQuantile(0.975, 2000)).toBeCloseTo(1.96, 2);
		expect(() => tQuantile(0.975, 0)).toThrow(RangeError);
	});

	it('the mean and Welch intervals: [0, 1, 1, 2, 0, 3] → 1.167 ± 1.227', () => {
		const [lo, hi] = meanInterval([0, 1, 1, 2, 0, 3]);
		expect(lo).toBeCloseTo(-0.06, 2);
		expect(hi).toBeCloseTo(2.39, 2);
		expect(meanInterval([2])).toEqual([2, 2]);
		const w = welch([1, 2, 3, 4], [2, 3, 4, 5]);
		expect(w.delta).toBe(-1);
		expect(w.df).toBeCloseTo(6, 6);
		expect(welch([1, 1], [1, 1]).interval).toEqual([0, 0]);
	});
});

describe('the tests', () => {
	it('Fisher on [[3, 1], [1, 3]] gives the textbook two-sided p of 0.486', () => {
		expect(fisherExact(3, 1, 1, 3).p).toBeCloseTo(0.4857, 3);
		expect(fisherExact(0, 0, 0, 0).p).toBe(1);
	});

	it('the sign test: 2 of 3 → 1; 0 of 10 → 0.00195; nothing → 1', () => {
		expect(signTest(2, 3).p).toBe(1);
		expect(signTest(0, 10).p).toBeCloseTo(2 / 1024, 6);
		expect(signTest(0, 0).p).toBe(1);
	});

	it('the sign test past a thousand pairs stays a number (WP89): 1700 of 3400 → 1; 1800 of 3400 → small', () => {
		expect(signTest(1700, 3400).p).toBe(1);
		const p = signTest(1800, 3400).p;
		expect(Number.isFinite(p)).toBe(true);
		expect(p).toBeLessThan(0.001);
	});
	it('Kolmogorov–Smirnov: identical samples D = 0, disjoint samples D = 1 with a small p', () => {
		expect(ksTwoSample([1, 2, 3], [1, 2, 3]).statistic).toBe(0);
		const apart = ksTwoSample(
			Array.from({ length: 50 }, (_, i) => i),
			Array.from({ length: 50 }, (_, i) => i + 100)
		);
		expect(apart.statistic).toBe(1);
		expect(apart.p).toBeLessThan(1e-6);
		expect(kolmogorovQ(0)).toBe(1);
		expect(ksTwoSample([], [1]).p).toBe(1);
	});
});
