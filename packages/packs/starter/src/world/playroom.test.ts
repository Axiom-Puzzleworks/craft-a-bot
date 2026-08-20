import type { ActionCall } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { PLAYROOM_WORLD_ID, playroom } from './playroom.js';
import { playroomLayouts } from './layouts.js';
import type { PlayroomState } from './state.js';

function snapshotOf(instance: ReturnType<typeof playroom.create>): PlayroomState {
	// Cast: `snapshot()` returns the opaque `WorldState`; these tests authored the world.
	return instance.snapshot() as PlayroomState;
}

/** A scripted run of the snack goal: cross the room, take the snack, hand it to Teddy. */
const SNACK_SCRIPT: ActionCall[] = [
	{ name: 'move', arguments: { direction: 'north' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'pick_up', arguments: { item: 'snack' } },
	{ name: 'move', arguments: { direction: 'south' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'move', arguments: { direction: 'east' } },
	{ name: 'say', arguments: { text: 'Hello Teddy, I brought you a snack!' } },
	{ name: 'give', arguments: { item: 'snack', character: 'teddy' } },
	{ name: 'celebrate', arguments: {} }
];

describe('the Playroom world definition', () => {
	it('declares its id, layouts, actions, senses, and predicates', () => {
		expect(playroom.id).toBe(PLAYROOM_WORLD_ID);
		expect(playroom.layouts).toHaveLength(11);
		expect(playroom.actions).toHaveLength(8);
		expect(playroom.senses).toHaveLength(5);
		expect(Object.keys(playroom.predicates)).toHaveLength(7);
	});

	it('creates an instance for every layout it advertises', () => {
		for (const layout of playroom.layouts) {
			const state = snapshotOf(playroom.create(layout.id));
			expect(state.width).toBe(8);
			expect(state.height).toBe(6);
		}
	});

	it('refuses an unknown layout loudly', () => {
		expect(() => playroom.create('the-moon')).toThrow(/Unknown Playroom layout/);
	});
});

describe('instance isolation', () => {
	it('does not let one instance mutate the shared layout template', () => {
		const first = playroom.create('snack-hunt');
		first.perform({ name: 'move', arguments: { direction: 'north' } });

		const second = playroom.create('snack-hunt');
		expect(snapshotOf(second).bot.position).toEqual({ x: 0, y: 4 });
	});

	it('returns a copy from snapshot(), not a live handle on the state', () => {
		const instance = playroom.create('greeting');
		const snapshot = snapshotOf(instance);
		snapshot.bot.position = { x: 7, y: 0 };
		expect(snapshotOf(instance).bot.position).toEqual({ x: 0, y: 4 });
	});
});

describe('determinism (08-GOVERNANCE-GUARDRAILS.md §7.5)', () => {
	it('replays an action list to an identical final state', () => {
		const runOnce = () => {
			const instance = playroom.create('snack-hunt');
			for (const action of SNACK_SCRIPT) instance.perform(action);
			return snapshotOf(instance);
		};

		expect(runOnce()).toEqual(runOnce());
	});

	it('produces identical narration on every replay', () => {
		const narrate = () => {
			const instance = playroom.create('snack-hunt');
			return SNACK_SCRIPT.map((action) => instance.perform(action).narration);
		};

		expect(narrate()).toEqual(narrate());
	});

	it('produces identical observations on every replay', () => {
		const observe = () => {
			const instance = playroom.create('locked-chest');
			const seen: string[] = [];
			for (const action of SNACK_SCRIPT) {
				seen.push(instance.observe(['sight', 'compass', 'clock']).text);
				instance.perform(action);
			}
			return seen;
		};

		expect(observe()).toEqual(observe());
	});

	it('reset() restores the layout’s opening state exactly', () => {
		const instance = playroom.create('snack-hunt');
		const opening = snapshotOf(instance);

		for (const action of SNACK_SCRIPT) instance.perform(action);
		expect(snapshotOf(instance)).not.toEqual(opening);

		instance.reset();
		expect(snapshotOf(instance)).toEqual(opening);
	});
});

describe('the scripted snack run', () => {
	it('gets the snack to Teddy and satisfies the goal predicate', () => {
		const instance = playroom.create('snack-hunt');
		expect(instance.test('teddy-has-snack')).toBe(false);

		const results = SNACK_SCRIPT.map((action) => instance.perform(action));
		expect(results.every((result) => result.ok)).toBe(true);
		expect(instance.test('teddy-has-snack')).toBe(true);
	});

	it('counts a turn for every action, legal or not', () => {
		const instance = playroom.create('greeting');
		instance.perform({ name: 'move', arguments: { direction: 'west' } }); // into the wall
		instance.perform({ name: 'move', arguments: { direction: 'north' } });
		expect(snapshotOf(instance).tick).toBe(2);
	});

	it('treats an action the world does not have as a failed turn, not a crash', () => {
		const instance = playroom.create('greeting');
		const result = instance.perform({ name: 'teleport', arguments: { to: 'the moon' } });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('teleport');
	});

	it('reports false for a predicate this world has never heard of', () => {
		expect(playroom.create('greeting').test('world-peace')).toBe(false);
	});
});

describe('premature celebration', () => {
	it('lets the bot celebrate without the goal being met — the world still says no', () => {
		const instance = playroom.create('snack-hunt');
		const result = instance.perform({ name: 'celebrate', arguments: {} });
		expect(result.ok).toBe(true);
		expect(instance.test('teddy-has-snack')).toBe(false);
	});
});

describe('receiveInput', () => {
	it('delivers a user message into the Hearing channel, once', () => {
		const instance = playroom.create('greeting');
		instance.receiveInput?.('the snack is on the table');
		expect(instance.observe(['hearing']).text).toContain('the snack is on the table');
		expect(instance.observe(['hearing']).text).toContain('Nobody has said anything');
	});
});

describe('the shipped layouts', () => {
	it('gives every layout a unique id and a name', () => {
		const ids = playroomLayouts.map((layout) => layout.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const layout of playroomLayouts) expect(layout.name.length).toBeGreaterThan(0);
	});

	it('never starts the bot inside furniture, a container, or Teddy', () => {
		for (const layout of playroomLayouts) {
			const state = snapshotOf(playroom.create(layout.id));
			const occupied = [...state.furniture, ...state.containers, ...state.characters];
			for (const blocker of occupied) {
				expect(blocker.position).not.toEqual(state.bot.position);
			}
		}
	});

	it('locks the chest exactly where a key is also in the room', () => {
		for (const layout of playroomLayouts) {
			const state = snapshotOf(playroom.create(layout.id));
			const chest = state.containers.find((container) => container.id === 'toy-chest');
			if (chest?.state === 'locked') {
				expect(state.items.some((item) => item.id === chest.unlockedBy)).toBe(true);
			}
		}
	});
});
