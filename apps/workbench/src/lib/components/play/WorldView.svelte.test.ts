import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { playroom } from '@craftabot/pack-starter';
import WorldView from './WorldView.svelte';

/**
 * The grid has to agree with the words.
 *
 * Reported from play: "it picked up an A, but misrepresented it as a yellow B".
 * Both halves were half-right — this component kept its own map of block ids to
 * letters (`block-a: 'C'`), and when the ids were realigned with their printed
 * letters the world was corrected and the map was not. The grid drew one letter
 * while the trace said another, about the same object.
 *
 * For a simulator whose whole promise is that you can see what the bot sees,
 * the picture disagreeing with the narration is close to the worst available
 * bug.
 *
 * **The letters are drawn now** (WP18), as vector paths in `item-block-*.svg`,
 * so there is no text to compare. The block's *colour* is the half of the same
 * claim that markup can still be asked about, and it is a real half: the
 * world's narration says "a blue letter block (A)" in as many words. The other
 * half is pinned next door — `assets.test.ts` holds each block file to its
 * specified colour and to its ink-on-yellow letter, and holds the id-to-artefact
 * map against the world the pack actually builds.
 *
 * Together: the world names a colour, the file wears it, and this proves the
 * component drew *that* file for *that* id.
 */

/** `20-…` §2 — the three colours the world names out loud. */
const BLOCK_COLOUR: Record<string, string> = {
	'(A)': '#2456A6',
	'(B)': '#E9B62F',
	'(C)': '#C93A2E'
};

/**
 * The real Playroom, so the names are the ones the engine actually uses.
 *
 * Free Play rather than the tidy layout: WP11 re-scoped Tidy the Blocks down
 * to two blocks (`16-…` §1.1), and this is a test about letters, not about
 * which cards put which blocks on the floor.
 */
function tidyWorld() {
	return playroom.create('free-play').snapshot() as never as {
		items: { id: string; name: string; location: { kind: string } }[];
	};
}

describe('block colours', () => {
	const lettered = () => tidyWorld().items.filter((item) => /\([A-Z]\)/.test(item.name));

	it('has more than one lettered block, or none of this proves anything', () => {
		expect(lettered().length).toBeGreaterThan(1);
	});

	/*
	 * Per block, not per set.
	 *
	 * The first version of these tests compared the set of letters drawn with the
	 * set of letters named, which a *permuted* mapping passes happily — and a
	 * permutation is exactly what the bug was. Carrying one block at a time is
	 * unambiguous: there is one picture, and it belongs to one named item.
	 */
	it.each(['(A)', '(B)', '(C)'])('draws the %s block in its own colour when carried', (tag) => {
		const state = tidyWorld();
		const block = state.items.find((item) => item.name.includes(tag));
		if (!block) throw new Error(`no ${tag} block in the free-play layout`);
		block.location = { kind: 'carried' };

		render(WorldView, { props: { world: state as never, saying: undefined } });

		// The carried item mounts inside the pose's `#icon-slot`, so the bot is
		// what carries the evidence.
		const bot = screen.getByTestId('bot').innerHTML;
		expect(bot).toContain(BLOCK_COLOUR[tag]);
		for (const [other, colour] of Object.entries(BLOCK_COLOUR)) {
			if (other !== tag) expect(bot).not.toContain(colour);
		}
	});

	it('draws every lettered block on the grid as its own picture', () => {
		const state = tidyWorld();
		render(WorldView, { props: { world: state as never, saying: undefined } });

		for (const item of state.items) {
			const tag = /\([A-Z]\)/.exec(item.name)?.[0];
			if (!tag) continue;
			expect(screen.getByTestId(`item-${item.id}`).innerHTML).toContain(BLOCK_COLOUR[tag]);
		}
	});

	it('says what the bot is carrying, for a reader who cannot see it', () => {
		const state = tidyWorld();
		const block = state.items.find((item) => item.name.includes('(A)'));
		block!.location = { kind: 'carried' };

		render(WorldView, { props: { world: state as never, saying: undefined } });
		expect(screen.getByTestId('bot-carrying')).toHaveTextContent(block!.name);
	});
});

describe('the room', () => {
	it('draws the backdrop for the 8 × 6 Playroom', () => {
		render(WorldView, { props: { world: tidyWorld() as never } });
		expect(screen.getByTestId('backdrop')).toBeInTheDocument();
	});

	it('leaves a room of another shape undrawn rather than stretched', () => {
		// The backdrop is the one asset that hard-codes the grid (`20-…` §8.4). A
		// world of another size gets the rug colour and its cell washes back; a
		// wrong room would be worse than a plain one.
		const state = { ...tidyWorld(), width: 4, height: 4 } as never as {
			width: number;
			height: number;
		};
		render(WorldView, { props: { world: state as never } });
		expect(screen.queryByTestId('backdrop')).not.toBeInTheDocument();
	});

	it('opens the chest when the world says it is open', () => {
		const state = playroom.create('locked-chest').snapshot() as never as {
			containers: { id: string; state: string }[];
		};
		state.containers[0]!.state = 'open';

		render(WorldView, { props: { world: state as never } });
		const chest = document.querySelector('[data-state="open"]')!.innerHTML;
		expect(chest).toMatch(/<g data-part="state-open">/);
		expect(chest).toMatch(/<g[^>]*data-part="state-closed"[^>]*display="none"/);
	});

	it('puts the effect on the bot, so it lands on the thing it is about', () => {
		const refused = {
			id: '00000000-0000-4000-8000-000000000001',
			runId: '11111111-1111-4111-8111-111111111111',
			agentId: '22222222-2222-4222-8222-222222222222',
			tick: 1,
			timestamp: '2026-08-15T09:00:00.000Z',
			type: 'action.performed',
			payload: { name: 'move', arguments: {}, result: { ok: false, narration: 'too far' } }
		};

		render(WorldView, { props: { world: tidyWorld() as never, events: [refused] as never } });
		expect(screen.getByTestId('bot')?.parentElement).toContainElement(
			screen.getByTestId('fx-puzzled')
		);
	});

	it('cheers Teddy up when the run succeeded, and not before', () => {
		const state = tidyWorld();
		render(WorldView, { props: { world: state as never } });
		expect(screen.getByTestId('teddy')).toHaveAttribute('data-mood', 'idle');

		render(WorldView, { props: { world: state as never, outcome: 'SUCCESS' } });
		expect(screen.getAllByTestId('teddy')[1]).toHaveAttribute('data-mood', 'happy');
	});
});
