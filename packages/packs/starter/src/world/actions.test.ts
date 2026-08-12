import { describe, expect, it } from 'vitest';
import {
	carriedItem,
	findAction,
	playroomActionDefinitions,
	playroomActions,
	unknownActionNarration
} from './actions.js';
import type { PlayroomState } from './state.js';
import { carried, chest, heldBy, inContainer, onFloor, testState } from './test-state.js';

/** Runs an action by id; fails loudly if the id is not one of the seven. */
function act(state: PlayroomState, id: string, args: unknown = {}) {
	const action = findAction(id);
	if (!action) throw new Error(`no such action: ${id}`);
	return action.perform(state, args);
}

describe('action definitions', () => {
	it('ships the seven V1 actions (02-AGENT-MODEL.md §2.5)', () => {
		expect(playroomActions.map((action) => action.definition.id)).toEqual([
			'move',
			'pick_up',
			'put_down',
			'give',
			'open',
			'say',
			'celebrate'
		]);
	});

	it('derives a JSON schema for every action’s parameters', () => {
		for (const definition of playroomActionDefinitions) {
			expect(definition.parameters).toMatchObject({ type: 'object' });
			expect(definition.description.length).toBeGreaterThan(0);
		}
	});

	it('marks put_down’s container parameter optional but item required', () => {
		const putDown = findAction('put_down');
		expect(putDown?.definition.parameters).toMatchObject({ required: ['item'] });
	});

	it('findAction returns undefined for an unknown id', () => {
		expect(findAction('teleport')).toBeUndefined();
		expect(unknownActionNarration('teleport')).toContain('teleport');
	});
});

describe('argument validation', () => {
	it('rejects a direction that is not a compass point, without mutating', () => {
		const state = testState();
		const result = act(state, 'move', { direction: 'up' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('does not make sense');
		expect(state.bot.position).toEqual({ x: 4, y: 3 });
	});

	it('rejects a missing required argument', () => {
		expect(act(testState(), 'pick_up', {}).ok).toBe(false);
	});

	it('tolerates null arguments where the action takes none', () => {
		expect(act(testState(), 'celebrate', null).ok).toBe(true);
	});

	it('explains a whole-argument type error without a field name', () => {
		const result = act(testState(), 'move', 'north');
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('arguments');
	});
});

describe('move', () => {
	it('rolls one square into open floor', () => {
		const state = testState();
		const result = act(state, 'move', { direction: 'south' });
		expect(result.ok).toBe(true);
		expect(state.bot.position).toEqual({ x: 4, y: 4 });
		expect(result.stateDiff).toEqual([
			{ path: 'bot.position', from: { x: 4, y: 3 }, to: { x: 4, y: 4 } }
		]);
	});

	it('stops at the wall', () => {
		const state = testState({ bot: { position: { x: 0, y: 0 } } });
		const result = act(state, 'move', { direction: 'west' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('wall');
		expect(state.bot.position).toEqual({ x: 0, y: 0 });
	});

	it.each([
		['furniture', 'north', 'the table'],
		['a container', 'west', 'the toy chest'],
		['a character', 'east', 'Teddy']
	])('bumps into %s', (_kind, direction, expected) => {
		const state = testState();
		const result = act(state, 'move', { direction });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain(expected);
		expect(state.bot.position).toEqual({ x: 4, y: 3 });
	});
});

describe('pick_up', () => {
	it('picks up an item on the floor within reach', () => {
		const state = testState({ items: [onFloor('ball', { x: 5, y: 4 }, 'a stripy ball')] });
		const result = act(state, 'pick_up', { item: 'ball' });
		expect(result.ok).toBe(true);
		expect(carriedItem(state)?.id).toBe('ball');
	});

	it('refuses an item that does not exist', () => {
		const result = act(testState(), 'pick_up', { item: 'unicorn' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('unicorn');
	});

	it('refuses an item out of reach', () => {
		const state = testState({ items: [onFloor('ball', { x: 0, y: 0 })] });
		const result = act(state, 'pick_up', { item: 'ball' });
		expect(result.ok).toBe(false);
		expect(carriedItem(state)).toBeUndefined();
	});

	it('refuses when already carrying that very item', () => {
		const state = testState({ items: [carried('ball', 'a stripy ball')] });
		const result = act(state, 'pick_up', { item: 'ball' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('hands are already full');
	});

	it('refuses a second item while carrying one', () => {
		const state = testState({
			items: [carried('ball', 'a stripy ball'), onFloor('snack', { x: 4, y: 3 }, 'a snack')]
		});
		const result = act(state, 'pick_up', { item: 'snack' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('a stripy ball');
	});

	it('refuses an item somebody else is holding', () => {
		const state = testState({ items: [heldBy('snack', 'teddy', 'a snack')] });
		const result = act(state, 'pick_up', { item: 'snack' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('Teddy');
	});

	it('names the raw holder id when that character has vanished from the state', () => {
		const state = testState({ characters: [], items: [heldBy('snack', 'ghost', 'a snack')] });
		const result = act(state, 'pick_up', { item: 'snack' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('ghost');
	});

	it('lifts an item out of an open container in reach', () => {
		const state = testState({
			containers: chest('open'),
			items: [inContainer('block-a', 'toy-chest', 'a red block')]
		});
		const result = act(state, 'pick_up', { item: 'block-a' });
		expect(result.ok).toBe(true);
		expect(result.narration).toContain('reach into');
		expect(carriedItem(state)?.id).toBe('block-a');
	});

	it('refuses an item shut inside a closed container', () => {
		const state = testState({
			containers: chest('closed'),
			items: [inContainer('block-a', 'toy-chest', 'a red block')]
		});
		const result = act(state, 'pick_up', { item: 'block-a' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('shut inside');
	});

	it('refuses an item in a container that is out of reach', () => {
		const state = testState({
			containers: chest('open', { x: 0, y: 0 }),
			items: [inContainer('block-a', 'toy-chest', 'a red block')]
		});
		expect(act(state, 'pick_up', { item: 'block-a' }).ok).toBe(false);
	});

	it('degrades gracefully when an item names a container that is not there', () => {
		const state = testState({
			containers: [],
			items: [inContainer('block-a', 'missing-chest', 'a red block')]
		});
		const result = act(state, 'pick_up', { item: 'block-a' });
		expect(result.ok).toBe(false);
		expect(carriedItem(state)).toBeUndefined();
	});
});

describe('put_down', () => {
	it('puts the carried item on the rug where the bot stands', () => {
		const state = testState({ items: [carried('ball', 'a stripy ball')] });
		const result = act(state, 'put_down', { item: 'ball' });
		expect(result.ok).toBe(true);
		expect(state.items[0]?.location).toEqual({ kind: 'floor', position: { x: 4, y: 3 } });
	});

	it('pops the carried item into an open container in reach', () => {
		const state = testState({
			containers: chest('open'),
			items: [carried('block-a', 'a red block')]
		});
		const result = act(state, 'put_down', { item: 'block-a', container: 'toy-chest' });
		expect(result.ok).toBe(true);
		expect(state.items[0]?.location).toEqual({ kind: 'in-container', containerId: 'toy-chest' });
	});

	it('refuses an item that does not exist', () => {
		expect(act(testState(), 'put_down', { item: 'unicorn' }).ok).toBe(false);
	});

	it('refuses an item it is not carrying', () => {
		const state = testState({ items: [onFloor('ball', { x: 4, y: 3 })] });
		const result = act(state, 'put_down', { item: 'ball' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('not carrying');
	});

	it('refuses a container that does not exist', () => {
		const state = testState({ items: [carried('block-a')] });
		expect(act(state, 'put_down', { item: 'block-a', container: 'sink' }).ok).toBe(false);
	});

	it('refuses a container out of reach', () => {
		const state = testState({
			containers: chest('open', { x: 0, y: 0 }),
			items: [carried('block-a')]
		});
		expect(act(state, 'put_down', { item: 'block-a', container: 'toy-chest' }).ok).toBe(false);
	});

	it('refuses a container that is not open', () => {
		const state = testState({ containers: chest('closed'), items: [carried('block-a')] });
		const result = act(state, 'put_down', { item: 'block-a', container: 'toy-chest' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('not open');
	});
});

describe('give', () => {
	it('hands the carried item to an adjacent character', () => {
		const state = testState({ items: [carried('snack', 'a snack')] });
		const result = act(state, 'give', { item: 'snack', character: 'teddy' });
		expect(result.ok).toBe(true);
		expect(state.items[0]?.location).toEqual({ kind: 'held-by', characterId: 'teddy' });
	});

	it('refuses an item that does not exist', () => {
		expect(act(testState(), 'give', { item: 'unicorn', character: 'teddy' }).ok).toBe(false);
	});

	it('refuses an item it is not carrying', () => {
		const state = testState({ items: [onFloor('snack', { x: 4, y: 3 })] });
		expect(act(state, 'give', { item: 'snack', character: 'teddy' }).ok).toBe(false);
	});

	it('refuses a character who is not there', () => {
		const state = testState({ items: [carried('snack')] });
		expect(act(state, 'give', { item: 'snack', character: 'nobody' }).ok).toBe(false);
	});

	it('refuses a character out of reach', () => {
		const state = testState({
			characters: [{ id: 'teddy', name: 'Teddy', position: { x: 0, y: 0 } }],
			items: [carried('snack')]
		});
		const result = act(state, 'give', { item: 'snack', character: 'teddy' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('not close enough');
	});
});

describe('open', () => {
	it('opens a closed container in reach', () => {
		const state = testState({ containers: chest('closed') });
		const result = act(state, 'open', { container: 'toy-chest' });
		expect(result.ok).toBe(true);
		expect(state.containers[0]?.state).toBe('open');
	});

	it('unlocks a locked container when carrying its key', () => {
		const state = testState({
			containers: chest('locked'),
			items: [carried('red-key', 'a chunky red key')]
		});
		const result = act(state, 'open', { container: 'toy-chest' });
		expect(result.ok).toBe(true);
		expect(result.narration).toContain('turn a chunky red key');
		expect(state.containers[0]?.state).toBe('open');
	});

	it('refuses a locked container with empty hands', () => {
		const state = testState({ containers: chest('locked') });
		const result = act(state, 'open', { container: 'toy-chest' });
		expect(result.ok).toBe(false);
		expect(state.containers[0]?.state).toBe('locked');
	});

	it('refuses a locked container while carrying the wrong thing', () => {
		const state = testState({ containers: chest('locked'), items: [carried('ball')] });
		expect(act(state, 'open', { container: 'toy-chest' }).ok).toBe(false);
	});

	it('refuses a container that does not exist', () => {
		expect(act(testState(), 'open', { container: 'sink' }).ok).toBe(false);
	});

	it('refuses a container out of reach', () => {
		const state = testState({ containers: chest('closed', { x: 0, y: 0 }) });
		expect(act(state, 'open', { container: 'toy-chest' }).ok).toBe(false);
	});

	it('refuses a container that is already open', () => {
		const state = testState({ containers: chest('open') });
		const result = act(state, 'open', { container: 'toy-chest' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('already open');
	});
});

describe('say and celebrate', () => {
	it('records what was said, and where it was said from', () => {
		const state = testState({ tick: 4 });
		const result = act(state, 'say', { text: 'Hello Teddy!' });
		expect(result.ok).toBe(true);
		expect(state.spoken).toEqual([{ tick: 4, text: 'Hello Teddy!', position: { x: 4, y: 3 } }]);
	});

	it('celebrates — legal at any time, which is what makes premature celebration possible', () => {
		const state = testState();
		const result = act(state, 'celebrate');
		expect(result.ok).toBe(true);
		expect(state.celebrated).toBe(true);
	});
});

describe('carriedItem', () => {
	it('is undefined with empty hands and the item when carrying', () => {
		expect(carriedItem(testState())).toBeUndefined();
		expect(carriedItem(testState({ items: [carried('ball')] }))?.id).toBe('ball');
	});
});
