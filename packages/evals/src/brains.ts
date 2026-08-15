import type { MockScript } from '@craftabot/core/testing';
import { obedient, turn } from '@craftabot/core/testing';
import type { Plan } from '@craftabot/pack-starter/testing';

/**
 * **The two brains that run in CI** (`13-…` §8).
 *
 * That section names three tiers. `scripted-optimal` is the solvability floor —
 * what a perfect bot gets, and the row that says a card is winnable at all.
 * `scripted-noisy` is the one worth building: an optimal plan with error rates
 * injected, so the matrix can catch **information-design regressions without
 * spending anything**. `live` is the third and does not belong here; it needs a
 * key, a spend cap and a nightly lane.
 *
 * The point of the noisy tier is easy to miss. It is not a simulation of a
 * language model — nothing here predicts what GPT would do. It is a *fixed,
 * reproducible amount of wrongness*, so that when the world's wording or the
 * prompt or the memory summary changes, the change shows up as a movement in
 * the score of a bot whose behaviour did not change at all. A bot that is
 * always right cannot tell you whether the world explains itself well, because
 * it never needs an explanation.
 *
 * All three failure modes are drawn from what real runs actually did (`12-…`
 * C3, C4): naming things almost-but-not-quite right, wandering off, and
 * declaring victory early.
 */

export type ScriptedTier = 'scripted-optimal' | 'scripted-noisy';

export interface NoiseRates {
	/** Chance a turn names something almost, but not quite, right. */
	misname: number;
	/** Chance a turn is spent moving somewhere pointless instead of on the plan. */
	wastedMove: number;
	/** Chance the bot declares victory before it has one. Once per run at most. */
	prematureCelebrate: number;
}

/**
 * Enough wrongness to separate a well-explained card from a badly-explained
 * one, not so much that every run is noise.
 *
 * These are deliberately *not* tuned to make any particular card pass or fail.
 * They are a fixed instrument; the cards are what is being measured. Changing
 * them invalidates every stored baseline, which is why they live in one named
 * constant rather than being spread across call sites.
 */
export const DEFAULT_NOISE: NoiseRates = {
	misname: 0.12,
	wastedMove: 0.12,
	prematureCelebrate: 0.04
};

export interface NoisyOptions {
	/** The cell's seed. The same seed always produces the same wrong bot. */
	seed: number;
	rates?: Partial<NoiseRates>;
}

/** The solvability floor: follow the plan exactly. */
export function scriptedOptimal(plan: Plan): MockScript {
	return obedient(plan);
}

/**
 * The plan, executed by a bot having a bad day.
 *
 * Stateful across turns, which it has to be: a wasted move does **not** advance
 * the plan, so the bot is now standing somewhere its next step did not expect.
 * That desynchronisation is the realistic part — one wrong turn early is what
 * turns a seven-step card into a run that ends out of steps, and modelling it as
 * "one wasted turn, then carry on perfectly" would measure something that never
 * happens.
 */
export function scriptedNoisy(plan: Plan, { seed, rates }: NoisyOptions): MockScript {
	const noise = { ...DEFAULT_NOISE, ...rates };
	const random = mulberry32(seed);
	let planIndex = 0;
	let hasCelebrated = false;

	return () => {
		/*
		 * Never on the last step, or "premature" would be indistinguishable from
		 * finishing — and only once, because the world refuses a second celebrate
		 * and the run would score a repeated failure that the bot never really
		 * made.
		 */
		if (!hasCelebrated && planIndex < plan.length - 1 && random() < noise.prematureCelebrate) {
			hasCelebrated = true;
			return turn('I think that will do. Hooray!', 'celebrate', {});
		}

		if (random() < noise.wastedMove) {
			const direction = DIRECTIONS[Math.floor(random() * DIRECTIONS.length)] as string;
			return turn(`Maybe it is ${direction} of here.`, 'move', { direction });
		}

		const step = plan[planIndex];
		// Past the end of the plan: the bot has lost its way badly enough that the
		// script has run out. Shrugging lets the step budget end the run, which is
		// the honest outcome rather than an invented one.
		if (!step) return { text: 'I am not sure what to do next.', toolCall: null };
		planIndex += 1;

		const args = random() < noise.misname ? misnamed(step.args) : (step.args ?? {});
		return turn(step.say, step.call, args);
	};
}

const DIRECTIONS = ['north', 'east', 'south', 'west'] as const;

/**
 * The fields that carry a name a bot can get wrong. `direction` and `text` are
 * not among them: a mistyped direction is a wasted move, which is already its
 * own failure mode, and mangling what the bot says would measure nothing.
 */
const NAMEABLE = ['item', 'container', 'character'] as const;

/**
 * Near misses, not nonsense — and **not synonyms either**, which is subtler
 * than it looks.
 *
 * The obvious table had `snack → biscuit`. The snack's name is "a snack (a
 * biscuit in a bowl)", so the world resolved it happily and the injected noise
 * was invisible: the misname rate was applied, the bot said the wrong word, and
 * the metric read zero because the wrong word was right. That is the resolver
 * doing its job, not a bug — the generosity is deliberate (`12-…` C4) — so the
 * *corruption* is what has to change.
 *
 * Each replacement is a plausible thing to call the object and a word the
 * Playroom does not contain. `brains.test.ts` drives real runs and asserts the
 * world really refuses these, so a future entity rename that reintroduces a
 * collision fails there rather than quietly turning the noisy tier optimal.
 */
const NEAR_MISSES: Record<string, string> = {
	block: 'brick',
	chest: 'crate',
	key: 'keycard',
	snack: 'sandwich',
	teddy: 'bear',
	ball: 'frisbee',
	table: 'desk'
};

function misnamed(args: unknown): unknown {
	if (args === null || typeof args !== 'object' || Array.isArray(args)) return args ?? {};
	const copy = { ...(args as Record<string, unknown>) };
	// Every nameable field, not merely the first: `give` names both an item and
	// a character, and corrupting only the item left the character path — the
	// one that produces `noSuchCharacter` — never exercised at all.
	for (const field of NAMEABLE) {
		const value = copy[field];
		if (typeof value === 'string') copy[field] = corrupt(value);
	}
	// A move or a celebrate has no name to get wrong. Left exactly as it was, so
	// the misname rate applies to turns that could actually misname something.
	return copy;
}

function corrupt(name: string): string {
	for (const [word, wrong] of Object.entries(NEAR_MISSES)) {
		if (name.includes(word)) return name.replace(word, wrong);
	}
	// An adjective the world has never heard of, which its word-order matching
	// cannot satisfy — so an unmapped noun still misses rather than resolving.
	return `wibbly ${name}`;
}

/** Mulberry32, the same generator `createTestClock` uses, on its own stream. */
function mulberry32(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
