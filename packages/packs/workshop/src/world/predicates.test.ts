import { describe, expect, it } from 'vitest';
import { workshopLayouts } from './layouts.js';
import { workshopPredicateDescriptions, workshopPredicates } from './predicates.js';
import type { WorkshopState } from './state.js';

function testState(): WorkshopState {
	return structuredClone(workshopLayouts[0]?.initialState as WorkshopState);
}

describe('found-the-paint-pot', () => {
	it('is false until the bot has collected paint', () => {
		const state = testState();
		expect(workshopPredicates['found-the-paint-pot']?.(state)).toBe(false);
	});

	it('is true once the bot has paint', () => {
		const state = testState();
		state.bot.hasPaint = true;
		expect(workshopPredicates['found-the-paint-pot']?.(state)).toBe(true);
	});
});

describe('birdhouse-painted-blue', () => {
	it('is false while the birdhouse is bare', () => {
		const state = testState();
		expect(workshopPredicates['birdhouse-painted-blue']?.(state)).toBe(false);
	});

	it('is false when painted a different colour', () => {
		const state = testState();
		const birdhouse = state.items.find((item) => item.id === 'birdhouse');
		if (!birdhouse) throw new Error('fixture missing birdhouse');
		birdhouse.painted = { color: 'red' };
		expect(workshopPredicates['birdhouse-painted-blue']?.(state)).toBe(false);
	});

	it('is true once painted blue', () => {
		const state = testState();
		const birdhouse = state.items.find((item) => item.id === 'birdhouse');
		if (!birdhouse) throw new Error('fixture missing birdhouse');
		birdhouse.painted = { color: 'blue' };
		expect(workshopPredicates['birdhouse-painted-blue']?.(state)).toBe(true);
	});
});

describe('workshopPredicateDescriptions', () => {
	it('describes every predicate the world can test', () => {
		expect(Object.keys(workshopPredicateDescriptions).sort()).toEqual(
			Object.keys(workshopPredicates).sort()
		);
	});
});
