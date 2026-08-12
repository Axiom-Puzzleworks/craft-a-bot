import { describe, expect, it } from 'vitest';
import { findAction } from './actions.js';
import { playroomLayouts } from './layouts.js';
import { observePlayroom } from './senses.js';
import type { PlayroomState } from './state.js';

/**
 * **Regression: the bot could not name what it could see.**
 *
 * Reported from play: the robot stood on the blue A block, tried to pick it up,
 * and got stuck until its steps ran out. The cause was a vocabulary mismatch —
 * Sight describes items by `name` ("a blue letter block (A)") and never shows an
 * id anywhere, while every action resolved its arguments by `id` alone. No
 * string the bot had ever been given would work, and the refusal ("there is no
 * such thing here") flatly contradicted what it could see, so it had nothing to
 * correct and looped.
 *
 * Nothing caught this because every mock script and demo plan hard-codes the
 * right ids. The suite was green while the game was unplayable — so these tests
 * deliberately go through the *real* layout and the *real* Sight text, and use
 * the words a model would actually read there.
 */

function playroom(mutate: (state: PlayroomState) => void = () => {}): PlayroomState {
	const layout = playroomLayouts.find((candidate) => candidate.id.includes('tidy'));
	if (!layout) throw new Error('the tidy layout has gone missing');
	const state = structuredClone(layout.initialState) as unknown as PlayroomState;
	mutate(state);
	return state;
}

const act = (state: PlayroomState, id: string, args: unknown) => {
	const action = findAction(id);
	if (!action) throw new Error(`no action ${id}`);
	return action.perform(state, args);
};

/** Where the blue A block actually is, found the way the bot would: by looking. */
function standOnBlueBlock(state: PlayroomState): void {
	const block = state.items.find((item) => item.name.includes('(A)'));
	if (!block || block.location.kind !== 'floor') throw new Error('no blue A block on the floor');
	state.bot.position = { ...block.location.position };
}

describe('the words the bot is actually given', () => {
	it('Sight names the block but never reveals an id', () => {
		const state = playroom(standOnBlueBlock);
		const sight = observePlayroom(state, ['sight']).text;

		expect(sight).toContain('a blue letter block (A)');
		// The heart of the bug: nothing in the observation is a usable identifier.
		expect(sight).not.toContain('block-a');
	});

	it('picks the block up when called exactly what Sight called it', () => {
		const state = playroom(standOnBlueBlock);
		const result = act(state, 'pick_up', { item: 'a blue letter block (A)' });

		expect(result.ok).toBe(true);
		expect(result.narration).toContain('You pick up a blue letter block (A)');
	});

	it.each([
		'blue letter block (A)',
		'blue letter block A',
		'A blue letter block (A) on the rug',
		'block-a'
	])('also accepts %j', (spoken) => {
		const state = playroom(standOnBlueBlock);
		expect(act(state, 'pick_up', { item: spoken }).ok).toBe(true);
	});

	it('still answers to its id, for anyone who knows it', () => {
		const state = playroom(standOnBlueBlock);
		expect(act(state, 'pick_up', { item: 'block-a' }).ok).toBe(true);
	});
});

describe('when the bot names something that is not there', () => {
	it('says what IS within reach, so the next turn can go somewhere', () => {
		const state = playroom(standOnBlueBlock);
		const result = act(state, 'pick_up', { item: 'a purple elephant' });

		expect(result.ok).toBe(false);
		// The old message stopped here. This one hands back a way forward.
		expect(result.narration).toContain('Within reach');
		expect(result.narration).toContain('a blue letter block (A)');
	});

	it('admits when there is genuinely nothing in reach', () => {
		const state = playroom((draft) => {
			draft.bot.position = { x: 0, y: 5 };
		});
		const result = act(state, 'pick_up', { item: 'a biscuit' });

		expect(result.ok).toBe(false);
		expect(result.narration).toContain('nothing within reach');
	});
});

describe('ambiguity', () => {
	it('asks which block rather than silently choosing one', () => {
		// Quietly picking a winner would recreate the original silent-wrong-object
		// failure, which is the one that wasted the player's whole run.
		const state = playroom(standOnBlueBlock);
		const result = act(state, 'pick_up', { item: 'letter block' });

		expect(result.ok).toBe(false);
		expect(result.narration).toContain('could mean');
		expect(result.narration).toContain('Say which one');
	});
});

describe('the same mismatch on the other actions', () => {
	it('opens the chest called by its name', () => {
		const chest = playroom().containers.find((container) => container.name.includes('chest'));
		if (!chest) throw new Error('no chest');
		const state = playroom((draft) => {
			draft.bot.position = { x: chest.position.x, y: chest.position.y + 1 };
		});

		expect(act(state, 'open', { container: 'the toy chest' }).ok).toBe(true);
	});

	it('gives to Teddy by name, capital and all', () => {
		const state = playroom((draft) => {
			const teddy = draft.characters[0];
			if (!teddy) throw new Error('no Teddy');
			draft.bot.position = { x: teddy.position.x, y: teddy.position.y + 1 };
			const block = draft.items.find((item) => item.name.includes('(A)'));
			if (!block) throw new Error('no block');
			block.location = { kind: 'carried' };
		});

		// The id is `teddy`; the world only ever shows the bot "Teddy".
		expect(act(state, 'give', { item: 'blue letter block (A)', character: 'Teddy' }).ok).toBe(true);
	});

	it('puts a block into the chest named as the bot sees it', () => {
		const chest = playroom().containers.find((container) => container.name.includes('chest'));
		if (!chest) throw new Error('no chest');
		const state = playroom((draft) => {
			draft.bot.position = { x: chest.position.x, y: chest.position.y + 1 };
			const target = draft.containers.find((candidate) => candidate.id === chest.id);
			if (target) target.state = 'open';
			const block = draft.items.find((item) => item.name.includes('(A)'));
			if (!block) throw new Error('no block');
			block.location = { kind: 'carried' };
		});

		const result = act(state, 'put_down', {
			item: 'a blue letter block (A)',
			container: 'the toy chest'
		});
		expect(result.ok).toBe(true);
	});
});

describe('block ids line up with the letters printed on them', () => {
	it('so a guess lands on the block it names, or fails honestly', () => {
		// `block-a` used to be the red C, which meant a plausible guess picked up
		// the wrong object and sent the bot across the room.
		const items = playroom().items;
		const letterOf = (id: string) => items.find((item) => item.id === id)?.name ?? '';

		expect(letterOf('block-a')).toContain('(A)');
		expect(letterOf('block-b')).toContain('(B)');
		expect(letterOf('block-c')).toContain('(C)');
	});
});

/**
 * The miss and ambiguity paths for characters and containers. The Playroom ships
 * one of each, so ambiguity needs a second one staged into the state — contrived,
 * but these branches decide what a stuck bot gets told, which is the whole point
 * of the fix.
 */
describe('naming people and containers badly', () => {
	it('lists who is actually here when the name is wrong', () => {
		const state = playroom((draft) => {
			const teddy = draft.characters[0];
			if (!teddy) throw new Error('no Teddy');
			draft.bot.position = { x: teddy.position.x, y: teddy.position.y + 1 };
			const block = draft.items.find((item) => item.name.includes('(A)'));
			if (block) block.location = { kind: 'carried' };
		});

		const result = act(state, 'give', { item: 'blue letter block (A)', character: 'Mrs Rabbit' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('In the playroom: Teddy');
	});

	it('takes an exact name over a partial one, so "Teddy" is never ambiguous', () => {
		const state = playroom((draft) => {
			const teddy = draft.characters[0];
			if (!teddy) throw new Error('no Teddy');
			draft.characters.push({ ...teddy, id: 'teddy-two', name: 'Teddy Two' });
			draft.bot.position = { x: teddy.position.x, y: teddy.position.y + 1 };
			const block = draft.items.find((item) => item.name.includes('(A)'));
			if (block) block.location = { kind: 'carried' };
		});

		const result = act(state, 'give', { item: 'blue letter block (A)', character: 'Teddy' });
		expect(result.ok).toBe(true);
	});

	it('asks which person when the name only half-matches both', () => {
		const state = playroom((draft) => {
			const teddy = draft.characters[0];
			if (!teddy) throw new Error('no Teddy');
			draft.characters.push({ ...teddy, id: 'teddy-two', name: 'Teddy Two' });
			draft.bot.position = { x: teddy.position.x, y: teddy.position.y + 1 };
			const block = draft.items.find((item) => item.name.includes('(A)'));
			if (block) block.location = { kind: 'carried' };
		});

		const result = act(state, 'give', { item: 'blue letter block (A)', character: 'Ted' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('could mean');
	});

	it('lists the containers when the name is wrong', () => {
		const result = act(playroom(), 'open', { container: 'the fridge' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('Containers in the playroom: the toy chest');
	});

	it('asks which container when the name half-matches both', () => {
		const state = playroom((draft) => {
			const chest = draft.containers[0];
			if (!chest) throw new Error('no chest');
			draft.containers.push({ ...chest, id: 'chest-two', name: 'the toy chest upstairs' });
		});

		const result = act(state, 'open', { container: 'chest' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('could mean');
	});

	it('refuses to put something into a container that is not there', () => {
		const state = playroom((draft) => {
			const block = draft.items.find((item) => item.name.includes('(A)'));
			if (block) block.location = { kind: 'carried' };
		});

		const result = act(state, 'put_down', {
			item: 'blue letter block (A)',
			container: 'the dishwasher'
		});
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('no container called');
	});

	it('counts an open chest you can reach as within reach', () => {
		// Covers the in-container arm of `reachableItemNames`.
		const chest = playroom().containers.find((container) => container.name.includes('chest'));
		if (!chest) throw new Error('no chest');
		const state = playroom((draft) => {
			draft.bot.position = { x: chest.position.x, y: chest.position.y + 1 };
			const target = draft.containers.find((candidate) => candidate.id === chest.id);
			if (target) target.state = 'open';
			const block = draft.items.find((item) => item.name.includes('(A)'));
			if (block) block.location = { kind: 'in-container', containerId: chest.id };
		});

		const result = act(state, 'pick_up', { item: 'a spaceship' });
		expect(result.ok).toBe(false);
		expect(result.narration).toContain('a blue letter block (A)');
	});
});
