import type { MatrixSpec } from './runner.js';

/**
 * **The matrices worth running**, named so a scorecard and a baseline can say
 * which one they came from.
 *
 * `13-…` §8's exit criterion is "eval baselines recorded for all six cards ×
 * three cartridges × 20 seeds". Six is exactly right and worth noticing: the
 * starter pack ships seven goal cards, one of which is flagged `expert` and is
 * *designed* to be unwinnable on the default budget. It gets its own matrix
 * with the budget it advertises, rather than being dropped or being counted as
 * six cards' worth of failure.
 *
 * **Three cartridges is the part that cannot run for free.** The pack ships no
 * cartridges of its own — the only one in the repo outside the OpenAI pack is a
 * mock used by tests — so the three are Quick, Deep and Penny Thinker, and
 * every one of them is a real API call against somebody's key. The scripted
 * matrix below is what CI can run on every commit; `LIVE_BASELINE` is the shape
 * of the run that produces the numbers §8 actually asks for, and it is
 * deliberately just data until somebody with a key and a spend cap executes it.
 */

/** The twenty seeds every baseline uses. Changing this invalidates all of them. */
export const BASELINE_SEEDS = Array.from({ length: 20 }, (_, index) => index + 1);

/** The six cards a player meets. */
export const STANDARD_CARDS = [
	'starter/say-hello',
	'starter/snack',
	'starter/tidy-the-blocks',
	'starter/locked-chest',
	'starter/sums-for-teddy',
	'starter/free-play'
];

/**
 * What CI runs: both scripted tiers over every standard card.
 *
 * The optimal row is the solvability floor and should be a wall of 100%. It
 * earns its place precisely because it is boring — the day it stops being
 * boring, a card has become unwinnable and the noisy numbers below it mean
 * nothing.
 */
export const SCRIPTED_MATRIX: MatrixSpec = {
	goalCardIds: STANDARD_CARDS,
	brains: [
		{ id: 'scripted-optimal', tier: 'scripted-optimal' },
		{ id: 'scripted-noisy', tier: 'scripted-noisy' }
	],
	configs: [{ id: 'default' }],
	seeds: BASELINE_SEEDS
};

/**
 * The expert card, on the budget it tells the player to set.
 *
 * Separate because mixing it into the standard matrix would need a per-cell
 * budget, and because "this card is hard on purpose" is a different claim from
 * "this card works", measured against a different bar.
 */
export const EXPERT_MATRIX: MatrixSpec = {
	goalCardIds: ['starter/locked-chest-expert'],
	brains: [
		{ id: 'scripted-optimal', tier: 'scripted-optimal' },
		{ id: 'scripted-noisy', tier: 'scripted-noisy' }
	],
	configs: [{ id: 'dial-turned-up', maxTicks: 60 }],
	seeds: BASELINE_SEEDS
};

/**
 * The live lane (`13-…` §8), as data.
 *
 * 6 cards × 3 cartridges × 20 seeds = **360 real runs**. Nothing here executes
 * it: `runMatrix` needs a `providerFor` for any live column and fails loudly
 * without one, precisely so that this constant cannot become a surprise bill.
 */
export const LIVE_BASELINE: MatrixSpec = {
	goalCardIds: STANDARD_CARDS,
	brains: [
		{ id: 'openai/quick-thinker', tier: 'live', cartridgeId: 'openai/quick-thinker' },
		{ id: 'openai/deep-thinker', tier: 'live', cartridgeId: 'openai/deep-thinker' },
		{ id: 'openai/penny-thinker', tier: 'live', cartridgeId: 'openai/penny-thinker' }
	],
	configs: [{ id: 'default' }],
	seeds: BASELINE_SEEDS
};

/**
 * The bands `13-…` §8 sets, for the **live** lane.
 *
 * Telemetry, not a gate. Live models drift, so a band that fails a build would
 * fail it for reasons nobody changed. They are recorded here so the scorecard
 * can say "below the expected band" rather than leaving a reader to remember
 * what good looked like.
 */
export const EXPECTED_BANDS: Record<string, { successRate: number; maxMedianTicks?: number }> = {
	'starter/say-hello': { successRate: 0.95, maxMedianTicks: 8 },
	'starter/snack': { successRate: 0.7 },
	'starter/tidy-the-blocks': { successRate: 0.6 },
	'starter/locked-chest': { successRate: 0.4 }
};
