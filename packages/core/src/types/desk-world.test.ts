import { describe, expect, it } from 'vitest';
import type { GridWorldState } from './grid-world.js';
import { isDeskWorldState, isGridWorldState, type DeskWorldState } from './desk-world.js';

/**
 * The two guards are the only code in core that looks inside a `world.changed`
 * payload to say what kind of world it is (`43-…` §4.1). They must be exact
 * and disjoint: a state that satisfies both, or neither, would draw wrongly
 * or not at all.
 */
const desk: DeskWorldState = {
	desk: { title: 'The Front Desk', role: 'Receptionist' },
	records: [],
	transcript: [],
	queue: [],
	alerts: []
};

const grid: GridWorldState = {
	width: 2,
	height: 2,
	bot: { position: { x: 0, y: 0 } },
	furniture: [],
	containers: [],
	characters: [],
	items: []
};

describe('isDeskWorldState / isGridWorldState', () => {
	it('tell a desk from a grid, and neither from nonsense', () => {
		expect(isDeskWorldState(desk)).toBe(true);
		expect(isGridWorldState(desk)).toBe(false);
		expect(isGridWorldState(grid)).toBe(true);
		expect(isDeskWorldState(grid)).toBe(false);
		for (const nonsense of [undefined, null, 3, 'desk', [], {}, { desk: 'yes' }]) {
			expect(isDeskWorldState(nonsense)).toBe(false);
			expect(isGridWorldState(nonsense)).toBe(false);
		}
	});

	it('are disjoint even when a world carries extra fields of its own', () => {
		const richDesk = { ...desk, tick: 4, hidden: [], heardCursor: 0 };
		const richGrid = { ...grid, tick: 4, spoken: [], heard: [] };
		expect(isDeskWorldState(richDesk) && !isGridWorldState(richDesk)).toBe(true);
		expect(isGridWorldState(richGrid) && !isDeskWorldState(richGrid)).toBe(true);
	});

	it('refuse a desk missing any of its four drawn lists, and a grid without a bot', () => {
		expect(isDeskWorldState({ ...desk, queue: undefined })).toBe(false);
		expect(isDeskWorldState({ ...desk, desk: { role: 'x' } })).toBe(false);
		expect(isGridWorldState({ ...grid, bot: undefined })).toBe(false);
		expect(isGridWorldState({ ...grid, items: 'none' })).toBe(false);
	});
});
