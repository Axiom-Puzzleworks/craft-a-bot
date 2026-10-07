import { describe, expect, it } from 'vitest';
import {
	bootstrapMeanInterval,
	choose,
	firstDivergence,
	firstTickAgreement,
	itemReliability,
	passAtK,
	passHatK,
	pathDistance
} from './reliability.js';
import { wilson } from './intervals.js';

/**
 * **Reliability over trials** (WP191): hand cases a reader can recompute,
 * the unit being the item (not the trial), and the path measures.
 */
describe('pass@k and pass^k per item', () => {
	it('counts combinations exactly', () => {
		expect([choose(4, 2), choose(3, 3), choose(5, 0), choose(2, 3)]).toEqual([6, 1, 1, 0]);
	});

	it('reads "some" and "every" at n = k, and the unbiased estimator above it', () => {
		// n = k = 2: pass@2 is "at least one of the two", pass^2 is "both".
		expect(passAtK(2, 1, 2)).toBe(1);
		expect(passAtK(2, 0, 2)).toBe(0);
		expect(passHatK(2, 1, 2)).toBe(0);
		expect(passHatK(2, 2, 2)).toBe(1);
		// n = 4, c = 1, k = 2: of the six pairs of trials, three hold the pass, none is all passes.
		expect(passAtK(4, 1, 2)).toBeCloseTo(0.5, 12);
		expect(passHatK(4, 1, 2)).toBe(0);
		// n = 4, c = 3, k = 2: three of the six pairs are both passes.
		expect(passHatK(4, 3, 2)).toBeCloseTo(0.5, 12);
		// pass@1 is the pass rate and pass^1 is too.
		expect(passAtK(3, 2, 1)).toBeCloseTo(2 / 3, 12);
		expect(passHatK(3, 2, 1)).toBeCloseTo(2 / 3, 12);
	});

	it('has no reading below k trials', () => {
		expect(passAtK(1, 1, 2)).toBeUndefined();
		expect(passHatK(1, 1, 2)).toBeUndefined();
	});
});

describe('reliability over items', () => {
	const items = [
		{ passes: 2, trials: 2 },
		{ passes: 1, trials: 2 },
		{ passes: 0, trials: 2 },
		{ passes: 2, trials: 2 }
	];

	it('gives pass@1, pass@2, pass^2 and consistency for four items of two trials', () => {
		const result = itemReliability(items, 2);
		expect(result.items).toBe(4);
		expect(result.pass1.value).toBeCloseTo((1 + 0.5 + 0 + 1) / 4, 12);
		expect(result.passAtK.value).toBeCloseTo(3 / 4, 12);
		expect(result.passHatK.value).toBeCloseTo(2 / 4, 12);
		expect(result.consistency.value).toBeCloseTo(3 / 4, 12);
		// Items reading 0 or 1 take the Wilson interval over items.
		expect(result.passAtK.interval).toEqual(wilson(3, 4));
		expect(result.passAtK.method).toContain('Wilson');
		// pass@1 reads between 0 and 1, so it takes the seeded bootstrap.
		expect(result.pass1.method).toContain('bootstrap');
	});

	it('leaves out an item with fewer than k trials, and says so', () => {
		const result = itemReliability([...items, { passes: 1, trials: 1 }], 2);
		expect(result.items).toBe(4);
		expect(result.skipped).toBe(1);
	});

	it('takes the item as the unit: more trials of the same items do not narrow the interval of pass^k', () => {
		const twoTrials = itemReliability(items, 2).passHatK.interval;
		// The same four items, each performed five times with the same pass fractions' shape.
		const fiveTrials = itemReliability(
			[
				{ passes: 5, trials: 5 },
				{ passes: 2, trials: 5 },
				{ passes: 0, trials: 5 },
				{ passes: 5, trials: 5 }
			],
			2
		).passHatK.interval;
		// Both are over four items; neither is a Wilson interval over eight or twenty trials.
		expect(twoTrials[1] - twoTrials[0]).toBeGreaterThan(0.4);
		expect(fiveTrials[1] - fiveTrials[0]).toBeGreaterThan(0.4);
	});

	it('is deterministic: the same items give the same bootstrap interval, another seed another', () => {
		const values = [0.1, 0.4, 0.5, 0.9, 1, 0, 0.3, 0.6];
		expect(bootstrapMeanInterval(values, { seed: 3 })).toEqual(
			bootstrapMeanInterval(values, { seed: 3 })
		);
		expect(bootstrapMeanInterval(values, { seed: 3 })).not.toEqual(
			bootstrapMeanInterval(values, { seed: 4 })
		);
	});
});

describe('how far two trials ran together', () => {
	it('finds the first tick two paths differ, and says nothing when they do not', () => {
		expect(firstDivergence(['a', 'b', 'c'], ['a', 'b', 'c'])).toBeUndefined();
		expect(firstDivergence(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
		// One path stopped sooner: they diverge where the shorter ended.
		expect(firstDivergence(['a', 'b'], ['a', 'b', 'c'])).toBe(2);
		expect(firstDivergence([], ['a'])).toBe(0);
	});

	it('measures how far they forked as an edit distance', () => {
		expect(pathDistance(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(0);
		expect(pathDistance(['a', 'b', 'c'], ['a', 'x', 'c'])).toBe(1);
		expect(pathDistance(['a', 'b'], ['a', 'b', 'c', 'd'])).toBe(2);
		expect(pathDistance([], ['a', 'b'])).toBe(2);
	});

	it('compares the first call and the first words of every pair of trials: the prompt was the same, so the difference is the model’s', () => {
		const agreement = firstTickAgreement([
			{ call: 'find-root-cause charges', words: 'I will look.' },
			{ call: 'find-root-cause charges', words: 'Let me look.' },
			{ call: 'find-root-cause service', words: 'I will look.' }
		]);
		expect(agreement).toEqual({ pairs: 3, sameCall: 1, sameWords: 1 });
		expect(firstTickAgreement([{ call: 'a', words: 'b' }])).toEqual({
			pairs: 0,
			sameCall: 0,
			sameWords: 0
		});
	});
});
