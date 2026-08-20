import { describe, expect, it } from 'vitest';
import {
	BLOCK_IDS,
	playroomPredicateDescriptions,
	playroomPredicates,
	playroomProgress
} from './predicates.js';
import type { PlayroomItem, PlayroomState, SpokenLine } from './state.js';
import { carried, chest, heldBy, inContainer, onFloor, testState } from './test-state.js';

function check(name: string, state: PlayroomState): boolean {
	const predicate = playroomPredicates[name];
	if (!predicate) throw new Error(`no such predicate: ${name}`);
	return predicate(state);
}

function spoke(text: string, x: number, y: number): SpokenLine {
	return { tick: 1, text, position: { x, y } };
}

/** All three blocks, tucked into the chest. */
function blocksInChest(): PlayroomItem[] {
	return BLOCK_IDS.map((id) => inContainer(id, 'toy-chest'));
}

describe('said-hello-near-teddy', () => {
	// Teddy sits at (5,3) in the test state; "within 2 squares" is Chebyshev ≤ 2.
	it('is false before the bot says anything', () => {
		expect(check('said-hello-near-teddy', testState())).toBe(false);
	});

	it('is true when spoken from exactly two squares away', () => {
		const state = testState({ spoken: [spoke('Hello!', 3, 3)] });
		expect(check('said-hello-near-teddy', state)).toBe(true);
	});

	it('is true diagonally within two squares', () => {
		const state = testState({ spoken: [spoke('Hello!', 3, 1)] });
		expect(check('said-hello-near-teddy', state)).toBe(true);
	});

	it('is false when shouted from across the room', () => {
		const state = testState({ spoken: [spoke('Hello!', 0, 0)] });
		expect(check('said-hello-near-teddy', state)).toBe(false);
	});

	it('is false when there is no Teddy to greet', () => {
		const state = testState({ characters: [], spoken: [spoke('Hello!', 5, 3)] });
		expect(check('said-hello-near-teddy', state)).toBe(false);
	});
});

describe('teddy-has-snack', () => {
	it('is true only once Teddy is holding it', () => {
		expect(check('teddy-has-snack', testState({ items: [heldBy('snack', 'teddy')] }))).toBe(true);
	});

	it('is false while the bot still carries it or it sits on the floor', () => {
		expect(check('teddy-has-snack', testState({ items: [onFloor('snack', { x: 4, y: 3 })] }))).toBe(
			false
		);
	});

	it('is false when somebody else has it', () => {
		expect(check('teddy-has-snack', testState({ items: [heldBy('snack', 'someone-else')] }))).toBe(
			false
		);
	});

	it('is false when there is no snack at all', () => {
		expect(check('teddy-has-snack', testState())).toBe(false);
	});
});

describe('blocks-in-chest', () => {
	it('is true when all three are inside', () => {
		expect(check('blocks-in-chest', testState({ items: blocksInChest() }))).toBe(true);
	});

	it('is false when one is still on the rug', () => {
		const items = [
			inContainer('block-a', 'toy-chest'),
			inContainer('block-b', 'toy-chest'),
			onFloor('block-c', { x: 2, y: 2 })
		];
		expect(check('blocks-in-chest', testState({ items }))).toBe(false);
	});

	it('is false when a block is in the wrong container', () => {
		const items = [
			inContainer('block-a', 'toy-chest'),
			inContainer('block-b', 'toy-chest'),
			inContainer('block-c', 'the-bin')
		];
		expect(check('blocks-in-chest', testState({ items }))).toBe(false);
	});

	it('is false when the blocks are not in the world', () => {
		expect(check('blocks-in-chest', testState())).toBe(false);
	});
});

describe('chest-open-and-blocks-inside', () => {
	it('is true with the lid up and all three inside', () => {
		const state = testState({ containers: chest('open'), items: blocksInChest() });
		expect(check('chest-open-and-blocks-inside', state)).toBe(true);
	});

	it('is false if the lid has been shut again', () => {
		const state = testState({ containers: chest('closed'), items: blocksInChest() });
		expect(check('chest-open-and-blocks-inside', state)).toBe(false);
	});

	it('is false with the lid up but blocks still out', () => {
		const state = testState({ containers: chest('open') });
		expect(check('chest-open-and-blocks-inside', state)).toBe(false);
	});

	it('is false when there is no chest', () => {
		const state = testState({ containers: [], items: blocksInChest() });
		expect(check('chest-open-and-blocks-inside', state)).toBe(false);
	});
});

describe('correct-sum-said', () => {
	it('accepts the right answer on its own', () => {
		expect(check('correct-sum-said', testState({ spoken: [spoke('391', 4, 3)] }))).toBe(true);
	});

	it('accepts the right answer inside a sentence', () => {
		const state = testState({ spoken: [spoke('I think it is 391, Teddy.', 4, 3)] });
		expect(check('correct-sum-said', state)).toBe(true);
	});

	it('accepts the answer written with a thousands comma stripped out', () => {
		const state = testState({ spoken: [spoke('The answer is 3,91', 4, 3)] });
		expect(check('correct-sum-said', state)).toBe(true);
	});

	it('rejects a confidently wrong guess', () => {
		const state = testState({ spoken: [spoke('It is definitely 371!', 4, 3)] });
		expect(check('correct-sum-said', state)).toBe(false);
	});

	it('rejects the digits buried inside a longer number', () => {
		const state = testState({ spoken: [spoke('It is 13915', 4, 3)] });
		expect(check('correct-sum-said', state)).toBe(false);
	});

	it('is false before the bot says anything', () => {
		expect(check('correct-sum-said', testState())).toBe(false);
	});
});

describe('hiding-spot-shared', () => {
	it('accepts the answer on its own', () => {
		expect(
			check('hiding-spot-shared', testState({ spoken: [spoke('Behind the shelf!', 4, 3)] }))
		).toBe(true);
	});

	it('accepts the answer inside a sentence, whatever the case', () => {
		const state = testState({ spoken: [spoke('The best spot is BEHIND THE SHELF!', 4, 3)] });
		expect(check('hiding-spot-shared', state)).toBe(true);
	});

	it('rejects a confidently wrong guess', () => {
		const state = testState({ spoken: [spoke('Try under the table!', 4, 3)] });
		expect(check('hiding-spot-shared', state)).toBe(false);
	});

	it('is false before the bot says anything', () => {
		expect(check('hiding-spot-shared', testState())).toBe(false);
	});
});

describe('free-play-manual', () => {
	/**
	 * > **Amended 2026-08-13 (WP11):** the bot's own celebration ends a free-play
	 * > run, per E12. It used to be unsatisfiable by anything at all, which left
	 * > `celebrate` writing a flag nothing read (`12-…` C7/D10).
	 */
	it('is met once the bot celebrates — the one card where it decides', () => {
		expect(check('free-play-manual', testState({ celebrated: true }))).toBe(true);
	});

	it('is not met while the bot is still pottering about', () => {
		expect(check('free-play-manual', testState())).toBe(false);
	});
});

describe('the predicate catalogue', () => {
	it('describes every predicate it implements', () => {
		expect(Object.keys(playroomPredicateDescriptions).sort()).toEqual(
			Object.keys(playroomPredicates).sort()
		);
	});
});

/**
 * Progress descriptions. These exist because a bot could not otherwise tell how
 * far it had got: it would tidy a block away and, on the very next turn, have
 * no way to know it had.
 */
describe('describing progress', () => {
	const blocks = () => [
		onFloor('block-a', { x: 1, y: 1 }, 'a blue letter block (A)'),
		onFloor('block-b', { x: 2, y: 2 }, 'a yellow letter block (B)'),
		onFloor('block-c', { x: 3, y: 3 }, 'a red letter block (C)')
	];

	it('counts the blocks still out, and names them', () => {
		const state = testState({ containers: chest('open'), items: blocks() });
		const said = playroomProgress['blocks-in-chest']?.(state) ?? '';

		expect(said).toContain('0 of 3');
		expect(said).toContain('Still out');
		expect(said).toContain('(A)');
	});

	it('counts the ones already tidied away', () => {
		const state = testState({
			containers: chest('open'),
			items: [
				inContainer('block-a', 'toy-chest', 'a blue letter block (A)'),
				onFloor('block-b', { x: 2, y: 2 }, 'a yellow letter block (B)'),
				onFloor('block-c', { x: 3, y: 3 }, 'a red letter block (C)')
			]
		});
		expect(playroomProgress['blocks-in-chest']?.(state)).toContain('1 of 3');
	});

	it('says so plainly when the job is done', () => {
		const state = testState({
			containers: chest('open'),
			items: [
				inContainer('block-a', 'toy-chest'),
				inContainer('block-b', 'toy-chest'),
				inContainer('block-c', 'toy-chest')
			]
		});
		expect(playroomProgress['blocks-in-chest']?.(state)).toContain('All 3 blocks are in');
	});

	it('reports the lid separately for the locked-chest goal', () => {
		const closed = testState({ containers: chest('closed'), items: blocks() });
		expect(playroomProgress['chest-open-and-blocks-inside']?.(closed)).toContain('not open yet');

		const open = testState({ containers: chest('open'), items: blocks() });
		expect(playroomProgress['chest-open-and-blocks-inside']?.(open)).toContain(
			'The toy chest is open.'
		);
	});

	it('tracks the snack through all three of its states', () => {
		const onTable = testState({ items: [onFloor('snack', { x: 3, y: 1 })] });
		expect(playroomProgress['teddy-has-snack']?.(onTable)).toContain('not carrying');

		const held = testState({ items: [carried('snack')] });
		expect(playroomProgress['teddy-has-snack']?.(held)).toContain('You are carrying');

		const delivered = testState({ items: [heldBy('snack', 'teddy')] });
		expect(playroomProgress['teddy-has-snack']?.(delivered)).toContain('Teddy has the snack');
	});

	it('says nothing about a snack that is not in this layout', () => {
		expect(playroomProgress['teddy-has-snack']?.(testState({ items: [] }))).toBeUndefined();
	});

	it('offers nothing for goals with no meaningful middle', () => {
		// "Said hello" is done or not; a progress line would be noise.
		expect(playroomProgress['said-hello-near-teddy']).toBeUndefined();
		expect(playroomProgress['free-play-manual']).toBeUndefined();
	});
});
