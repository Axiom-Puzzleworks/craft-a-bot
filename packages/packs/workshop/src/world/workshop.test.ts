import type { ActionCall } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { WORKSHOP_WORLD_ID, qualifyWorkshopId, workshop } from './workshop.js';
import type { WorkshopState } from './state.js';

function snapshotOf(instance: ReturnType<typeof workshop.create>): WorkshopState {
	return instance.snapshot() as WorkshopState;
}

const PAINT_SCRIPT: ActionCall[] = [
	{ name: 'move', arguments: { direction: 'north' } },
	{ name: 'move', arguments: { direction: 'north' } },
	{ name: 'move', arguments: { direction: 'north' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'move', arguments: { direction: 'south' } },
	{ name: 'move', arguments: { direction: 'south' } },
	{ name: 'paint', arguments: { item: 'birdhouse', color: 'blue' } }
];

describe('the Workshop world definition', () => {
	it('declares its id, layouts, actions, senses, and predicates, all qualified', () => {
		expect(workshop.id).toBe(WORKSHOP_WORLD_ID);
		expect(workshop.layouts).toHaveLength(1);
		expect(workshop.actions.map((action) => action.id)).toEqual([
			qualifyWorkshopId('move'),
			qualifyWorkshopId('paint')
		]);
		expect(workshop.senses.map((sense) => sense.id)).toEqual([
			qualifyWorkshopId('sight'),
			qualifyWorkshopId('smell')
		]);
		expect(Object.keys(workshop.predicates).sort()).toEqual(
			['birdhouse-painted-blue', 'found-the-paint-pot'].sort()
		);
	});

	it('creates an instance for the one layout it advertises', () => {
		const state = snapshotOf(workshop.create('the-workshop'));
		expect(state.width).toBe(6);
		expect(state.height).toBe(5);
	});

	it('refuses an unknown layout loudly', () => {
		expect(() => workshop.create('the-attic')).toThrow(/Unknown Workshop layout/);
	});
});

describe('instance isolation', () => {
	it('does not let one instance mutate the shared layout template', () => {
		const first = workshop.create('the-workshop');
		first.perform({ name: 'move', arguments: { direction: 'north' } });

		const second = workshop.create('the-workshop');
		expect(snapshotOf(second).bot.position).toEqual({ x: 0, y: 4 });
	});

	it('returns a copy from snapshot(), not a live handle on the state', () => {
		const instance = workshop.create('the-workshop');
		const snapshot = snapshotOf(instance);
		snapshot.bot.position = { x: 5, y: 0 };
		expect(snapshotOf(instance).bot.position).toEqual({ x: 0, y: 4 });
	});
});

describe('a full run, start to finish', () => {
	it('collects paint on the way and paints the birdhouse blue', () => {
		const instance = workshop.create('the-workshop');
		for (const call of PAINT_SCRIPT) {
			const result = instance.perform(call);
			expect(result.ok, `${call.name} failed: ${result.narration}`).toBe(true);
		}
		expect(instance.test('found-the-paint-pot')).toBe(true);
		expect(instance.test('birdhouse-painted-blue')).toBe(true);
	});

	it('resets to the untouched initial state', () => {
		const instance = workshop.create('the-workshop');
		instance.perform({ name: 'move', arguments: { direction: 'north' } });
		instance.reset();
		expect(instance.test('found-the-paint-pot')).toBe(false);
		expect(snapshotOf(instance).bot.position).toEqual({ x: 0, y: 4 });
	});

	it('reports an unknown action cleanly rather than throwing', () => {
		const instance = workshop.create('the-workshop');
		const result = instance.perform({ name: 'teleport', arguments: {} });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('teleport');
	});

	it('an unrecognised predicate is simply false', () => {
		const instance = workshop.create('the-workshop');
		expect(instance.test('the-birdhouse-is-purple')).toBe(false);
	});
});
