import { describe, expect, it } from 'vitest';
import {
	findAction,
	unknownActionNarration,
	workshopActionDefinitions,
	workshopActions
} from './actions.js';
import { workshopLayouts } from './layouts.js';
import type { WorkshopState } from './state.js';

function testState(): WorkshopState {
	return structuredClone(workshopLayouts[0]?.initialState as WorkshopState);
}

/** Runs an action by id; fails loudly if the id is not one of the two. */
function act(state: WorkshopState, id: string, args: unknown = {}) {
	const action = findAction(id);
	if (!action) throw new Error(`no such action: ${id}`);
	return action.perform(state, args);
}

describe('action definitions', () => {
	it('ships the two Workshop actions', () => {
		expect(workshopActions.map((action) => action.definition.id)).toEqual(['move', 'paint']);
	});

	it('derives a JSON schema for every action’s parameters', () => {
		for (const definition of workshopActionDefinitions) {
			expect(definition.parameters).toMatchObject({ type: 'object' });
			expect(definition.description.length).toBeGreaterThan(0);
		}
	});

	it('tags paint, and only paint, as irreversible', () => {
		expect(findAction('move')?.definition.riskTier).toBe('observe');
		expect(findAction('paint')?.definition.riskTier).toBe('irreversible');
	});

	it('findAction returns undefined for an unknown id', () => {
		expect(findAction('teleport')).toBeUndefined();
		expect(unknownActionNarration('teleport')).toContain('teleport');
	});
});

describe('move', () => {
	it('rejects a direction that is not a compass point, without mutating', () => {
		const state = testState();
		const before = { ...state.bot.position };
		const result = act(state, 'move', { direction: 'up' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('does not make sense');
		expect(state.bot.position).toEqual(before);
	});

	it('explains a whole-argument type error without a field name', () => {
		const result = act(testState(), 'move', 'north');
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('arguments');
	});

	it('treats missing arguments as empty, not a crash', () => {
		// `null`, not the default-substituted `undefined` — the helper's own
		// default parameter would swallow `undefined` before it got here.
		const result = act(testState(), 'move', null);
		expect(result.ok).toBe(false);
	});

	it('stops at the wall rather than leaving the room', () => {
		const state = testState(); // bot starts at (0,4); south is the south wall
		const result = act(state, 'move', { direction: 'south' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('wall');
		expect(state.bot.position).toEqual({ x: 0, y: 4 });
	});

	it('stops at furniture rather than walking through it', () => {
		const state = testState();
		state.bot.position = { x: 3, y: 1 }; // the workbench sits at (3,2)
		const result = act(state, 'move', { direction: 'south' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('workbench');
		expect(state.bot.position).toEqual({ x: 3, y: 1 });
	});

	it('moves one square when the way is clear', () => {
		const state = testState();
		const result = act(state, 'move', { direction: 'north' });
		expect(result.ok).toBe(true);
		expect(state.bot.position).toEqual({ x: 0, y: 3 });
		expect(result.stateDiff).toEqual([
			{ path: 'bot.position', from: { x: 0, y: 4 }, to: { x: 0, y: 3 } }
		]);
	});
});

describe('paint', () => {
	it('rejects a missing required argument', () => {
		expect(act(testState(), 'paint', { item: 'birdhouse' }).ok).toBe(false);
	});

	it('cannot paint something that is not here', () => {
		const state = testState();
		const result = act(state, 'paint', { item: 'a shed nobody built', color: 'blue' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('cannot find');
	});

	it('cannot paint something not on the floor', () => {
		const state = testState();
		const birdhouse = state.items.find((item) => item.id === 'birdhouse');
		if (!birdhouse) throw new Error('fixture missing birdhouse');
		birdhouse.location = { kind: 'carried' };
		const result = act(state, 'paint', { item: 'birdhouse', color: 'blue' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('too far away');
	});

	it('cannot paint something out of reach', () => {
		const state = testState(); // bot at (0,4); birdhouse at (5,4)
		const result = act(state, 'paint', { item: 'birdhouse', color: 'blue' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('too far away');
	});

	it('refuses without paint, even standing right beside the birdhouse', () => {
		const state = testState();
		state.bot.position = { x: 4, y: 4 };
		expect(state.bot.hasPaint).toBe(false);
		const result = act(state, 'paint', { item: 'birdhouse', color: 'blue' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('no paint');
	});

	it('paints the birdhouse once paint has been collected', () => {
		const state = testState();
		state.bot.position = { x: 4, y: 4 };
		state.bot.hasPaint = true;
		const result = act(state, 'paint', { item: 'birdhouse', color: 'blue' });
		expect(result.ok).toBe(true);
		expect(result.narration).toContain('blue');
		const birdhouse = state.items.find((item) => item.id === 'birdhouse');
		expect(birdhouse?.painted).toEqual({ color: 'blue' });
		expect(result.stateDiff).toEqual([
			{ path: 'items.birdhouse.painted', from: undefined, to: { color: 'blue' } }
		]);
	});

	it('cannot be painted over once painted — there is no undo', () => {
		const state = testState();
		state.bot.position = { x: 4, y: 4 };
		state.bot.hasPaint = true;
		const first = act(state, 'paint', { item: 'birdhouse', color: 'blue' });
		expect(first.ok).toBe(true);
		const second = act(state, 'paint', { item: 'birdhouse', color: 'red' });
		expect(second.ok).toBe(false);
		expect(second.narration).toContain('already painted');
		const birdhouse = state.items.find((item) => item.id === 'birdhouse');
		expect(birdhouse?.painted).toEqual({ color: 'blue' });
	});

	it('matches by name as well as by id', () => {
		const state = testState();
		state.bot.position = { x: 4, y: 4 };
		state.bot.hasPaint = true;
		const result = act(state, 'paint', { item: 'plain wooden birdhouse', color: 'blue' });
		expect(result.ok).toBe(true);
	});
});
