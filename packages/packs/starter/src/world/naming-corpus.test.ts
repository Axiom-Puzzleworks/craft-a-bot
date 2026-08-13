import { describe, expect, it } from 'vitest';
import { playroomLayouts } from './layouts.js';
import {
	resolveCharacter,
	resolveContainer,
	resolveItem,
	type PlayroomState,
	type Resolution
} from './state.js';

/**
 * **The paraphrase corpus** (`13-…` §4.5, the fix for `12-…` C4).
 *
 * Every row is a phrasing a model has plausibly written, or would write, for
 * something in the Playroom, paired with what the world owes it in return.
 * The corpus is the contract: resolution rules get extended until it passes,
 * and it only ever grows — a row deleted is a paraphrase we have decided to
 * stop understanding.
 *
 * Three outcomes, and the difference between them matters more than the hit
 * rate does. `found` is a name understood. `ambiguous` is a name that honestly
 * describes more than one thing, and is a *success*: the bot is told which
 * ones and loses a turn. `none` costs the same turn and says what is within
 * reach. What must never happen is a confident match on the wrong object,
 * which is the failure this whole corpus exists to prevent.
 */

type Expectation = { query: string; expect: 'found' | 'ambiguous' | 'none'; id?: string };

/** Everything is out on the floor in Free Play, so one state exercises the lot. */
function fullRoom(): PlayroomState {
	const layout = playroomLayouts.find((candidate) => candidate.id === 'free-play');
	if (!layout) throw new Error('the free-play layout has gone missing');
	return structuredClone(layout.initialState) as unknown as PlayroomState;
}

const itemCorpus: Expectation[] = [
	// The id itself, and the way the world writes the name.
	{ query: 'block-a', expect: 'found', id: 'block-a' },
	{ query: 'block a', expect: 'found', id: 'block-a' },
	{ query: 'a blue letter block (A)', expect: 'found', id: 'block-a' },
	{ query: 'the blue letter block (A)', expect: 'found', id: 'block-a' },
	{ query: 'blue letter block', expect: 'found', id: 'block-a' },

	// The way a model actually writes it.
	{ query: 'blue block', expect: 'found', id: 'block-a' },
	{ query: 'the blue one', expect: 'none' },
	{ query: 'the A block', expect: 'found', id: 'block-a' },
	{ query: 'A block', expect: 'found', id: 'block-a' },
	{ query: 'block-b', expect: 'found', id: 'block-b' },
	{ query: 'yellow block', expect: 'found', id: 'block-b' },
	{ query: 'the B block', expect: 'found', id: 'block-b' },
	{ query: 'the yellow letter block (B)', expect: 'found', id: 'block-b' },
	{ query: 'block-c', expect: 'found', id: 'block-c' },
	{ query: 'red block', expect: 'found', id: 'block-c' },
	{ query: 'the C block', expect: 'found', id: 'block-c' },
	{ query: 'block c', expect: 'found', id: 'block-c' },

	// Honestly ambiguous: three blocks answer to all of these.
	{ query: 'block', expect: 'ambiguous' },
	{ query: 'the block', expect: 'ambiguous' },
	{ query: 'a block', expect: 'ambiguous' },
	{ query: 'letter block', expect: 'ambiguous' },
	{ query: 'the letter block', expect: 'ambiguous' },
	// Two red things in the room, and neither of them wins by default.
	{ query: 'red', expect: 'ambiguous' },

	// The key, which a bot needs under pressure and rarely spells out in full.
	{ query: 'red-key', expect: 'found', id: 'red-key' },
	{ query: 'key', expect: 'found', id: 'red-key' },
	{ query: 'the key', expect: 'found', id: 'red-key' },
	{ query: 'red key', expect: 'found', id: 'red-key' },
	{ query: 'the red key', expect: 'found', id: 'red-key' },
	{ query: 'a chunky red key', expect: 'found', id: 'red-key' },
	{ query: 'chunky key', expect: 'found', id: 'red-key' },
	{ query: 'the chunky red key on the floor', expect: 'found', id: 'red-key' },

	// The ball and the snack, including the parenthetical the snack hides behind.
	{ query: 'ball', expect: 'found', id: 'ball' },
	{ query: 'the ball', expect: 'found', id: 'ball' },
	{ query: 'stripy ball', expect: 'found', id: 'ball' },
	{ query: 'a stripy ball', expect: 'found', id: 'ball' },
	{ query: 'the stripy ball on the rug', expect: 'found', id: 'ball' },
	{ query: 'snack', expect: 'found', id: 'snack' },
	{ query: 'the snack', expect: 'found', id: 'snack' },
	{ query: 'biscuit', expect: 'found', id: 'snack' },
	{ query: 'the biscuit', expect: 'found', id: 'snack' },
	{ query: 'the biscuit in the bowl', expect: 'found', id: 'snack' },
	{ query: 'bowl', expect: 'found', id: 'snack' },

	// Things that are not items, and things that are not there.
	{ query: 'teddy', expect: 'none' },
	{ query: 'the toy chest', expect: 'none' },
	{ query: 'banana', expect: 'none' },
	{ query: 'the thing over there', expect: 'none' },
	{ query: '', expect: 'none' },
	{ query: 'the', expect: 'none' }
];

const characterCorpus: Expectation[] = [
	{ query: 'teddy', expect: 'found', id: 'teddy' },
	{ query: 'Teddy', expect: 'found', id: 'teddy' },
	{ query: 'the teddy', expect: 'found', id: 'teddy' },
	{ query: 'teddy bear', expect: 'found', id: 'teddy' },
	{ query: 'block-a', expect: 'none' }
];

const containerCorpus: Expectation[] = [
	{ query: 'toy-chest', expect: 'found', id: 'toy-chest' },
	{ query: 'the toy chest', expect: 'found', id: 'toy-chest' },
	{ query: 'toy chest', expect: 'found', id: 'toy-chest' },
	{ query: 'chest', expect: 'found', id: 'toy-chest' },
	{ query: 'the toybox', expect: 'none' }
];

function check(resolution: Resolution<{ id: string }>, row: Expectation): void {
	expect(resolution.kind, `"${row.query}"`).toBe(row.expect);
	if (resolution.kind === 'found' && row.id !== undefined) {
		expect(resolution.entity.id, `"${row.query}"`).toBe(row.id);
	}
}

describe('the paraphrase corpus', () => {
	const state = fullRoom();

	it.each(itemCorpus)('items: $query → $expect', (row) => {
		check(resolveItem(state, row.query), row);
	});

	it.each(characterCorpus)('people: $query → $expect', (row) => {
		check(resolveCharacter(state, row.query), row);
	});

	it.each(containerCorpus)('containers: $query → $expect', (row) => {
		check(resolveContainer(state, row.query), row);
	});
});

describe('the corpus as a measure', () => {
	/**
	 * WP11's number: of the phrasings that name exactly one thing, at least
	 * 95% must reach it. The rows above are the contract; this is the figure
	 * the roadmap's definition of done quotes, kept honest by being computed
	 * rather than asserted.
	 */
	it('resolves at least 95% of the phrasings that name one thing', () => {
		const state = fullRoom();
		const singular = [
			...itemCorpus.map((row) => ({ row, resolve: () => resolveItem(state, row.query) })),
			...characterCorpus.map((row) => ({ row, resolve: () => resolveCharacter(state, row.query) })),
			...containerCorpus.map((row) => ({
				row,
				resolve: () => resolveContainer(state, row.query)
			}))
		].filter(({ row }) => row.expect === 'found');

		const hits = singular.filter(({ row, resolve }) => {
			const resolution = resolve();
			return resolution.kind === 'found' && resolution.entity.id === row.id;
		});

		expect(singular.length).toBeGreaterThanOrEqual(40);
		expect(hits.length / singular.length).toBeGreaterThanOrEqual(0.95);
	});
});
