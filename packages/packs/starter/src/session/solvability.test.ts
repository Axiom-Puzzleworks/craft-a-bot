import { DEFAULT_TICK_BUDGET } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { starterGoalCards } from '../goal-cards.js';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **L3: the solvability proofs** (`13-…` §2), and WP11's headline promise.
 *
 * One scripted-optimal solution per goal card, run through the real session
 * over the real Playroom. Two things are being proved, and the second is the
 * one V1.0 got wrong:
 *
 *  1. every card *can* be won — the predicate flips, the run ends SUCCESS;
 *  2. every card can be won **inside the budget a player actually gets**.
 *
 * "Tidy the blocks" needed about 34 turns and "The locked chest" about 45,
 * against a 30-turn platform floor, so both were unwinnable by any bot ever
 * built and nothing said so (`12-…` C6). Nobody noticed because no test had
 * ever tried to win them. This is that test.
 *
 * Each plan's length is the card's `par`, asserted both ways: the plan must
 * not be longer than the card claims, and the card must not claim more than
 * the plan needs. A card whose layout changes will fail here until its par is
 * re-measured, which is the point.
 */

type Plan = Array<{ say: string; call: string; args?: unknown }>;

const north = (say: string) => ({ say, call: 'move', args: { direction: 'north' } });
const south = (say: string) => ({ say, call: 'move', args: { direction: 'south' } });
const east = (say: string) => ({ say, call: 'move', args: { direction: 'east' } });

/** Teddy sits at (5,4); the bot starts at (0,4) and may greet from two squares away. */
const SAY_HELLO: Plan = [
	east('Teddy must be somewhere east.'),
	east('Still going.'),
	east('There is Teddy.'),
	{ say: 'Close enough!', call: 'say', args: { text: 'Hello Teddy, I am your new robot!' } }
];

/** The snack is on the table at (3,2); Teddy wants it. */
const SNACK: Plan = [
	east('The table is over that way.'),
	east('Nearly there.'),
	north('Right beside the table now.'),
	{ say: 'There is the snack.', call: 'pick_up', args: { item: 'snack' } },
	east('Now to find Teddy.'),
	east('Teddy is just here.'),
	{ say: 'Here you are, Teddy.', call: 'give', args: { item: 'snack', character: 'teddy' } }
];

/** Two blocks — (3,1) and (2,3) — and an unlocked chest at (1,0). */
const TIDY: Plan = [
	north('Something yellow over there.'),
	east('Beside it now.'),
	{ say: 'Got the yellow one.', call: 'pick_up', args: { item: 'yellow block' } },
	north('Back to the chest.'),
	north('Beside the chest.'),
	{ say: 'Lid up first.', call: 'open', args: { container: 'the toy chest' } },
	{ say: 'In it goes.', call: 'put_down', args: { item: 'yellow block', container: 'toy chest' } },
	east('Now the blue one.'),
	{ say: 'Got it.', call: 'pick_up', args: { item: 'blue block' } },
	{ say: 'And in.', call: 'put_down', args: { item: 'blue block', container: 'toy chest' } }
];

/** Locked chest at (1,0), key inboard at (2,2), one block still out at (2,3). */
const LOCKED_CHEST: Plan = [
	north('The chest is locked. Something must open it.'),
	north('Looking about.'),
	east('There is something red by the table.'),
	{ say: 'A key!', call: 'pick_up', args: { item: 'the key' } },
	north('Back to the chest with it.'),
	{ say: 'Turning the key.', call: 'open', args: { container: 'the toy chest' } },
	{ say: 'Hands free for the block.', call: 'put_down', args: { item: 'the key' } },
	south('The last block is down here.'),
	south('Beside it.'),
	{ say: 'Got it.', call: 'pick_up', args: { item: 'red block' } },
	north('Back again.'),
	north('Beside the chest.'),
	{
		say: 'And away it goes.',
		call: 'put_down',
		args: { item: 'red block', container: 'toy chest' }
	}
];

/** 17 × 23 = 391, which a bot that guesses will get wrong. */
const SUMS: Plan = [
	{
		say: 'I could guess, but I have a calculator.',
		call: 'calculator',
		args: { expression: '17 * 23' }
	},
	{ say: 'Telling Teddy.', call: 'say', args: { text: '17 times 23 is 391.' } }
];

/** Free Play has no predicate: the bot decides it is finished (E12). */
const FREE_PLAY: Plan = [
	{ say: 'I have had a lovely potter about. I am done.', call: 'celebrate' }
];

/**
 * The expert card: V1.0's locked chest, unchanged. Three blocks scattered to
 * (6,1), (2,3) and (7,4), the key in the far corner, one pair of hands.
 */
const LOCKED_CHEST_EXPERT: Plan = [
	north('The chest is locked. Keys end up in corners.'),
	north('Still climbing.'),
	north('The corner is just above me.'),
	{ say: 'There it is.', call: 'pick_up', args: { item: 'the key' } },
	{ say: 'Turning the key.', call: 'open', args: { container: 'the toy chest' } },
	{ say: 'Hands free.', call: 'put_down', args: { item: 'the key' } },

	// The red block, down at (2,3).
	east('Now for the blocks.'),
	south('Down we go.'),
	south('Almost.'),
	{ say: 'Got the yellow one.', call: 'pick_up', args: { item: 'yellow block' } },
	north('Back up.'),
	north('Beside the chest.'),
	{ say: 'In.', call: 'put_down', args: { item: 'yellow block', container: 'toy chest' } },

	// The blue block, out east at (6,1).
	east('One over on the right.'),
	east('Rolling east.'),
	east('Still rolling.'),
	east('Nearly there.'),
	{ say: 'Got the blue one.', call: 'pick_up', args: { item: 'blue block' } },
	{ say: 'Back west.', call: 'move', args: { direction: 'west' } },
	{ say: 'And west.', call: 'move', args: { direction: 'west' } },
	{ say: 'Beside the chest.', call: 'move', args: { direction: 'west' } },
	{ say: 'In.', call: 'put_down', args: { item: 'blue block', container: 'toy chest' } },

	// The last one, in the far corner at (7,4).
	east('One left, right over in the corner.'),
	east('Rolling.'),
	east('Rolling.'),
	east('Rolling.'),
	south('Down a bit.'),
	south('Beside it now.'),
	{ say: 'The last block.', call: 'pick_up', args: { item: 'red block' } },
	{ say: 'The long way home.', call: 'move', args: { direction: 'west' } },
	{ say: 'West.', call: 'move', args: { direction: 'west' } },
	{ say: 'West.', call: 'move', args: { direction: 'west' } },
	{ say: 'West.', call: 'move', args: { direction: 'west' } },
	{ say: 'North.', call: 'move', args: { direction: 'north' } },
	{ say: 'North.', call: 'move', args: { direction: 'north' } },
	{
		say: 'Beside the chest at last.',
		call: 'put_down',
		args: { item: 'red block', container: 'toy chest' }
	}
];

const PLANS: Record<string, Plan> = {
	'starter/say-hello': SAY_HELLO,
	'starter/snack': SNACK,
	'starter/tidy-the-blocks': TIDY,
	'starter/locked-chest': LOCKED_CHEST,
	'starter/sums-for-teddy': SUMS,
	'starter/free-play': FREE_PLAY,
	'starter/locked-chest-expert': LOCKED_CHEST_EXPERT
};

const TOOLS: Record<string, string[]> = { 'starter/sums-for-teddy': ['starter/calculator'] };

async function solve(goalCardId: string, maxTicks?: number) {
	const plan = PLANS[goalCardId];
	if (!plan) throw new Error(`no scripted solution for ${goalCardId}`);
	const tools = TOOLS[goalCardId];
	return runToCompletion({
		script: obedient(plan),
		spec: buildSpec({ goalCardId, ...(tools ? { tools } : {}) }),
		stepLimit: plan.length + 5,
		...(maxTicks !== undefined ? { maxTicks } : {})
	});
}

describe('every goal card has a scripted solution', () => {
	it('ships a plan for every card in the pack', () => {
		expect(Object.keys(PLANS).sort()).toEqual(starterGoalCards.map((card) => card.id).sort());
	});

	const winnable = starterGoalCards.filter((card) => !card.expert);

	it.each(winnable)('$id is won inside the default budget', async (card) => {
		const run = await solve(card.id);
		expect(run.outcome).toBe('SUCCESS');
		expect(run.byType('tick.started').length).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
	});

	it.each(winnable.filter((card) => card.par !== undefined))(
		'$id takes exactly the par it advertises',
		async (card) => {
			const run = await solve(card.id);
			expect(run.byType('tick.started')).toHaveLength(card.par as number);
		}
	);

	it('does not waste a single turn: every action in an optimal plan works', async () => {
		for (const card of winnable) {
			const run = await solve(card.id);
			const failed = run
				.byType('action.performed')
				.filter((event) => !(event.payload as { result: { ok: boolean } }).result.ok);
			expect(failed, `${card.id} wasted a turn`).toHaveLength(0);
		}
	});
});

describe('the expert card', () => {
	const expert = starterGoalCards.find((card) => card.expert);

	it('cannot be won on the default budget — which is why it says so', async () => {
		const run = await solve(expert?.id ?? '');
		expect(run.outcome).toBe('OUT_OF_STEPS');
	});

	it('is won once the builder turns the step dial up', async () => {
		const run = await solve(expert?.id ?? '', 60);
		expect(run.outcome).toBe('SUCCESS');
		expect(run.byType('tick.started')).toHaveLength(expert?.par as number);
	});
});

/**
 * The C1 regression named in `13-…` §4.4: a bot must be able to go back to
 * something it saw once. Sight reaches one square, so the memory summary is
 * the only record — if it holds names without bearings, "I saw a snack
 * somewhere" is unactionable and the run degenerates into wandering.
 */
describe('what the memory window is worth', () => {
	it('records where a thing was, not merely that it existed', async () => {
		const run = await solve('starter/snack');
		const summaries = run
			.byType('sense')
			.map((event) => (event.payload as { observation: { summary?: string } }).observation.summary)
			.filter((summary): summary is string => summary !== undefined);

		const sighting = summaries.find((summary) => summary.includes('snack'));
		expect(sighting).toBeDefined();
		expect(sighting).toMatch(/at column \d+, row \d+/);
		expect(sighting).toMatch(/to the (north|south|east|west)/);
	});
});
