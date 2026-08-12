import { describe, expect, it } from 'vitest';
import {
	distance,
	inBounds,
	neighbourhood,
	relativeDirection,
	sameCell,
	step,
	withinReach
} from './grid.js';

describe('step', () => {
	it.each([
		['north', { x: 3, y: 2 }],
		['south', { x: 3, y: 4 }],
		['east', { x: 4, y: 3 }],
		['west', { x: 2, y: 3 }]
	] as const)('moves one square %s', (direction, expected) => {
		expect(step({ x: 3, y: 3 }, direction)).toEqual(expected);
	});
});

describe('inBounds', () => {
	it.each([
		[{ x: 0, y: 0 }, true],
		[{ x: 7, y: 5 }, true],
		[{ x: -1, y: 0 }, false],
		[{ x: 0, y: -1 }, false],
		[{ x: 8, y: 0 }, false],
		[{ x: 0, y: 6 }, false]
	])('%o → %s', (cell, expected) => {
		expect(inBounds(cell, 8, 6)).toBe(expected);
	});
});

describe('sameCell', () => {
	it('compares by coordinates, not identity', () => {
		expect(sameCell({ x: 2, y: 3 }, { x: 2, y: 3 })).toBe(true);
		expect(sameCell({ x: 2, y: 3 }, { x: 3, y: 2 })).toBe(false);
	});
});

describe('distance / withinReach', () => {
	it('uses Chebyshev distance so diagonals count as one', () => {
		expect(distance({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(1);
		expect(distance({ x: 0, y: 0 }, { x: 3, y: 1 })).toBe(3);
	});

	it('puts the eight neighbours and the bot’s own square in reach', () => {
		expect(withinReach({ x: 4, y: 4 }, { x: 4, y: 4 })).toBe(true);
		expect(withinReach({ x: 4, y: 4 }, { x: 5, y: 5 })).toBe(true);
		expect(withinReach({ x: 4, y: 4 }, { x: 6, y: 4 })).toBe(false);
	});
});

describe('neighbourhood', () => {
	it('returns nine cells in open space', () => {
		expect(neighbourhood({ x: 4, y: 3 }, 8, 6)).toHaveLength(9);
	});

	it('clips at the corners of the room', () => {
		expect(neighbourhood({ x: 0, y: 0 }, 8, 6)).toHaveLength(4);
		expect(neighbourhood({ x: 7, y: 5 }, 8, 6)).toHaveLength(4);
	});
});

describe('relativeDirection', () => {
	const origin = { x: 4, y: 3 };
	it.each([
		[{ x: 4, y: 3 }, 'here'],
		[{ x: 4, y: 1 }, 'north'],
		[{ x: 4, y: 5 }, 'south'],
		[{ x: 7, y: 3 }, 'east'],
		[{ x: 1, y: 3 }, 'west'],
		[{ x: 6, y: 1 }, 'north-east'],
		[{ x: 1, y: 1 }, 'north-west'],
		[{ x: 6, y: 5 }, 'south-east'],
		[{ x: 1, y: 5 }, 'south-west']
	] as const)('%o is %s', (target, expected) => {
		expect(relativeDirection(origin, target)).toBe(expected);
	});
});
