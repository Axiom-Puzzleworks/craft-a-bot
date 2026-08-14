import { describe, expect, it } from 'vitest';
import { boxArtFor } from './box-art.js';

/**
 * **Every bot's box looks like its own box** (`16-…` §2.3, `12-…` D17).
 *
 * §2.3's acceptance is "distinct box art per bot". The seed has been on the
 * spec since WP14 and rendered nowhere, so a shelf of six bots was six
 * identical boxes with a name in small type.
 */
describe('boxArtFor', () => {
	/**
	 * The whole reason it is a *seed*. The same bot must look the same on every
	 * visit and on every machine, and an exported kit must arrive somewhere else
	 * wearing the face it left with.
	 */
	it('gives the same box the same art, every time', () => {
		expect(boxArtFor('seed-1')).toEqual(boxArtFor('seed-1'));
	});

	it('tells bots apart', () => {
		const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
		const looks = seeds.map((seed) => JSON.stringify(boxArtFor(seed)));

		// Not a promise of uniqueness — a finite palette cannot make one — but a
		// shelf of eight should not be eight of the same thing.
		expect(new Set(looks).size).toBeGreaterThan(4);
	});

	it('always picks a real corner and a brand colour', () => {
		for (const seed of ['', 'x', 'a-very-long-seed-value', '🤖']) {
			const art = boxArtFor(seed);
			// Right-hand corners only: the left of the lid belongs to the brick
			// colour strip, which a sticker there covered up.
			expect(['top-right', 'bottom-right']).toContain(art.corner);
			expect(art.colour.startsWith('var(--cab-')).toBe(true);
		}
	});

	/** A sticker applied by hand, not one that fell off. */
	it('tilts a little, never alarmingly', () => {
		for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']) {
			expect(Math.abs(boxArtFor(seed).tilt)).toBeLessThanOrEqual(6);
		}
	});

	/** An empty seed is still a box, not a crash. */
	it('copes with an empty seed', () => {
		expect(() => boxArtFor('')).not.toThrow();
	});
});
