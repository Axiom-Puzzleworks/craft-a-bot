import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { GoalCardDefinition } from '@craftabot/core';
import GoalCardRack from './GoalCardRack.svelte';

/**
 * **Par on the card holder** (`16-…` §1.1, the half WP11 left for the UI wave).
 *
 * WP11 re-scoped the cards and measured a par for each, then deliberately
 * stopped: the number existed in the manifest and appeared nowhere a player
 * could see it. A card that states its par is a card a child can hold against
 * the step-budget dial — which is the whole reason the dial is on the bench.
 */
const card = (over: Partial<GoalCardDefinition> = {}): GoalCardDefinition => ({
	id: 'starter/tidy-the-blocks',
	title: 'Tidy the Blocks',
	goalText: 'Put the blocks in the toy chest.',
	worldId: 'starter/playroom',
	layoutId: 'tidy',
	successCondition: 'blocks-inside',
	hints: ['the toy chest'],
	teachesConcepts: ['tool-use'],
	par: 13,
	...over
});

const props = (cards: GoalCardDefinition[], activeCardId: string) => ({
	cards,
	activeCardId,
	customGoalText: '',
	onselect: () => {},
	oncustomtext: () => {}
});

describe('GoalCardRack — par', () => {
	it('tells the player roughly how many steps the card takes', () => {
		render(GoalCardRack, { props: props([card()], 'starter/tidy-the-blocks') });

		expect(screen.getByTestId('card-par')).toHaveTextContent('About 13 steps');
	});

	/**
	 * Free Play has no machine-checkable goal and so has no par. Showing "About
	 * undefined steps" would be worse than showing nothing, and inventing a
	 * number for a goal the child wrote themselves would simply be a lie.
	 */
	it('says nothing about par on a card that has none', () => {
		const freePlay = card({ id: 'starter/free-play', title: 'Free Play' });
		delete (freePlay as { par?: number }).par;

		render(GoalCardRack, { props: props([freePlay], 'starter/free-play') });

		expect(screen.queryByTestId('card-par')).toBeNull();
	});

	/**
	 * The expert card is the reason the step-budget dial exists: it cannot be won
	 * on the default budget, and saying so turns an inevitable OUT_OF_STEPS from
	 * a broken toy into an invitation to turn the dial up.
	 */
	it('warns that an expert card needs a bigger budget', () => {
		const expert = card({
			id: 'starter/locked-chest-expert',
			title: 'Locked Chest (Expert)',
			par: 36,
			expert: true
		});

		render(GoalCardRack, { props: props([expert], 'starter/locked-chest-expert') });

		expect(screen.getByTestId('card-par')).toHaveTextContent('About 36 steps');
		expect(screen.getByTestId('card-expert')).toHaveTextContent('bigger step budget');
	});

	/** An ordinary card is not scolded for being ordinary. */
	it('does not warn about a card that fits the default budget', () => {
		render(GoalCardRack, { props: props([card()], 'starter/tidy-the-blocks') });

		expect(screen.queryByTestId('card-expert')).toBeNull();
	});

	/**
	 * `expert` is the card author's declaration, not something inferred from par
	 * — a pack may ship a long card it considers ordinary.
	 */
	it('takes the card at its word rather than guessing from par', () => {
		const longButOrdinary = card({ par: 99 });

		render(GoalCardRack, { props: props([longButOrdinary], 'starter/tidy-the-blocks') });

		expect(screen.getByTestId('card-par')).toHaveTextContent('About 99 steps');
		expect(screen.queryByTestId('card-expert')).toBeNull();
	});
});
