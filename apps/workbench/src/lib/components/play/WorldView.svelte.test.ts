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
 * bug — so the letters are now derived from the item's name, and this pins the
 * two together.
 */

/** The real Playroom, so the names are the ones the engine actually uses. */
function tidyWorld() {
	const world = playroom.create('tidy-up');
	return world.snapshot() as never as {
		items: { id: string; name: string; location: { kind: string } }[];
	};
}

describe('block letters', () => {
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
	 * unambiguous: there is one glyph, and it belongs to one named item.
	 */
	it.each(['(A)', '(B)', '(C)'])('draws the %s block as its own letter when carried', (tag) => {
		const state = tidyWorld();
		const block = state.items.find((item) => item.name.includes(tag));
		if (!block) throw new Error(`no ${tag} block in the tidy layout`);
		block.location = { kind: 'carried' };

		render(WorldView, { props: { world: state as never, saying: undefined } });
		expect(screen.getByTestId('bot-carrying')).toHaveTextContent(tag.slice(1, 2));
	});

	it('draws every lettered block somewhere on the grid', () => {
		const state = tidyWorld();
		render(WorldView, { props: { world: state as never, saying: undefined } });

		const drawn = [...document.querySelectorAll('.glyph')]
			.map((node) => node.textContent?.trim() ?? '')
			.filter((text) => /^[A-Z]$/.test(text));
		const named = state.items
			.map((item) => /\(([A-Z])\)/.exec(item.name)?.[1])
			.filter((letter): letter is string => letter !== undefined);

		expect(drawn.sort()).toStrictEqual(named.sort());
	});

	it('leaves non-lettered items on their own glyphs', () => {
		const state = tidyWorld();
		render(WorldView, { props: { world: state as never, saying: undefined } });
		// The ball is still a ball, not a stray letter.
		expect(document.body.textContent).toContain('⬤');
	});
});
