import { describe, expect, it } from 'vitest';
import { cohensKappa } from './agreement.js';

/** Cohen's κ's edges (WP119, `105-CORPORA.md` §6): the disagreements named, a single label on both sides, no rows, unequal lengths. */
describe('cohensKappa', () => {
	it('names the rows the two labellers disagree on', () => {
		const result = cohensKappa(['a', 'b', 'c', 'a'], ['a', 'b', 'a', 'a']);
		expect(result.disagreements).toEqual([2]);
		expect(result.observed).toBe(0.75);
		// p_o = 3/4; p_e = ½·¾ + ¼·¼ = 7/16; κ = (3/4 − 7/16) / (9/16) = 5/9.
		expect(result.value).toBeCloseTo(5 / 9, 10);
	});

	it('is 1 for full agreement, and reads one label given everywhere without dividing by zero', () => {
		expect(cohensKappa(['a', 'b'], ['a', 'b']).value).toBe(1);
		expect(cohensKappa(['a', 'a'], ['a', 'a'])).toMatchObject({ value: 1, interval: [1, 1] });
		expect(cohensKappa([], [])).toMatchObject({ value: 0, n: 0 });
	});

	it('refuses two lists of different lengths', () => {
		expect(() => cohensKappa(['a'], [])).toThrow(/the same rows/);
	});
});
