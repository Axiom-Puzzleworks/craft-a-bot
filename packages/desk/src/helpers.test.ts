import { describe, expect, it } from 'vitest';
import { closest } from './closest.js';
import { DEFAULT_SEED, seedFrom, seededRandom } from './seeded.js';

describe('closest', () => {
	it('offers the nearest names first, keeps order on ties, and stays quiet when nothing is near', () => {
		const names = ['say', 'look-up', 'sign-in', 'escalate'];
		expect(closest('sign-up', names)).toEqual(['sign-in']);
		expect(closest('SAY', names)).toEqual(['say']);
		expect(closest('lookup', names, 1)).toEqual(['look-up']);
		expect(closest('zzzzzzzzzzzz', names)).toEqual([]);
		expect(closest('', names)).toEqual([]);
	});
});

describe('seededRandom / seedFrom', () => {
	it('is a deterministic stream in [0, 1)', () => {
		const a = seededRandom(7);
		const b = seededRandom(7);
		const first = Array.from({ length: 5 }, () => a());
		expect(Array.from({ length: 5 }, () => b())).toEqual(first);
		for (const value of first) {
			expect(value).toBeGreaterThanOrEqual(0);
			expect(value).toBeLessThan(1);
		}
		expect(seededRandom(8)()).not.toBe(first[0]);
	});

	it('seeds from one draw of the caller’s stream, or the fixed default', () => {
		expect(seedFrom(undefined)).toBe(DEFAULT_SEED);
		let calls = 0;
		const seed = seedFrom(() => {
			calls += 1;
			return 0.5;
		});
		expect(calls).toBe(1);
		expect(seed).toBe(Math.floor(0.5 * 0x7fffffff));
	});
});
