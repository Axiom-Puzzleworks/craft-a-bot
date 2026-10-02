import type { ChatRequest, DecisionFaultSpec } from '@craftabot/core';
import type { MockScript, MockTurn } from '@craftabot/core/testing';
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

export type ScriptedTier =
	| 'scripted-optimal'
	| 'scripted-noisy'
	| 'scripted-adversary'
	| 'scripted-counterpart'
	| 'fallible';

/**
 * The counterpart seat's brain (WP55, `46-COUNTERPARTS.md` §4.5): drives a
 * live seat along a `CounterpartScript` through the same interpreter the
 * desk runtime uses, so a two-seat episode reproduces without a model. It
 * lives in `@craftabot/desk` beside the interpreter (this package depends on
 * that one, so it cannot be here without a cycle) and is re-exported under
 * the tier's name.
 */
export { scriptedCounterpart } from '@craftabot/desk';

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
 * The attacker's brain (WP38, `28-CAMPAIGNS.md` §4.3): a bot that does what
 * the untrusted content says — obediently, deterministically, with no noise.
 * Its own tier name, so a report never files an attack under the optimal
 * brain's column; the plan itself is content (`ADVERSARY_PLANS`), proved by
 * the scenario tests that import it.
 */
export function scriptedAdversary(plan: Plan): MockScript {
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

	return (request) => {
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

		const stepArgs = step.argsFrom ? step.argsFrom(request) : (step.args ?? {});
		const args = random() < noise.misname ? misnamed(stepArgs) : stepArgs;
		// The call too may be the prompt's (WP106): a stage whose act depends on the request read at the turn.
		return turn(step.say, step.callFrom ? step.callFrom(request) : step.call, args);
	};
}

/** An error model's fault with its rate resolved from the calibration table (`resolveErrorModel`). */
export interface ResolvedFault {
	spec: DecisionFaultSpec;
	/** P(the decision is wrong), from the row. */
	rate: number;
}

export interface FallibleOptions {
	/** The cell's seed, mixed with the card: the same seed plants the same faults. */
	seed: number;
	errorModelId: string;
	faults: readonly ResolvedFault[];
}

const SHRUG_TURN: MockTurn = { text: 'I am not sure what to do next.', toolCall: null };
const bareOf = (name: string): string => name.slice(name.lastIndexOf('/') + 1);

/**
 * **The fallible tier** (WP115, `103-FALLIBLE-ACTORS.md` §5; `100-…` §6.1,
 * D14): the plan played exactly, but at each decision an error model names
 * — a `decide { outcome }` on the lending desk, the fraud desk's `release` /
 * `hold` / `freeze-account` — the decision is wrong with the row's
 * probability, uniformly over the other options or toward one. One seeded
 * draw per matched decision (and a second only when it errs), so the same
 * seed plants the same faults; every fault rides out on the turn as `fault`,
 * which the session writes as `decision.fault` beside the decision. A rate of
 * 0 is `scripted-optimal`, turn for turn.
 */
export function scriptedFallible(plan: Plan, options: FallibleOptions): MockScript {
	const base = obedient(plan);
	const random = mulberry32(options.seed);
	const next = (request: ChatRequest, index: number): MockTurn =>
		typeof base === 'function' ? base(request, index) : (base[index] ?? SHRUG_TURN);
	return (request, index) => {
		const planned = next(request, index);
		const call = planned.toolCall;
		if (!call) return planned;
		const bare = bareOf(call.name);
		for (const { spec, rate } of options.faults) {
			if (spec.field !== undefined) {
				if (bare !== spec.action) continue;
				const args = (call.arguments ?? {}) as Record<string, unknown>;
				const current = args[spec.field];
				if (typeof current !== 'string' || !spec.options.includes(current)) continue;
				const roll = random();
				if (roll >= rate) return planned;
				const wrong = wrongOption(spec, current, random);
				if (wrong === undefined) return planned;
				return {
					...planned,
					toolCall: { name: call.name, arguments: { ...args, [spec.field]: wrong } },
					fault: {
						field: spec.field,
						chose: wrong,
						shouldHave: current,
						errorModel: options.errorModelId,
						draw: { rate, roll }
					}
				};
			}
			if (!spec.options.includes(bare)) continue;
			const roll = random();
			if (roll >= rate) return planned;
			const wrong = wrongOption(spec, bare, random);
			if (wrong === undefined) return planned;
			const prefix = call.name.slice(0, call.name.length - bare.length);
			return {
				...planned,
				toolCall: { name: `${prefix}${wrong}`, arguments: call.arguments },
				fault: {
					field: 'action',
					chose: wrong,
					shouldHave: bare,
					errorModel: options.errorModelId,
					draw: { rate, roll }
				}
			};
		}
		return planned;
	};
}

/** Another option than `current`: the one the direction points at, or one drawn uniformly from the rest. */
function wrongOption(
	spec: DecisionFaultSpec,
	current: string,
	random: () => number
): string | undefined {
	if (spec.direction !== 'uniform') {
		const toward = spec.direction.toward;
		return toward !== current && spec.options.includes(toward) ? toward : undefined;
	}
	const others = spec.options.filter((option) => option !== current);
	if (others.length === 0) return undefined;
	return others[Math.floor(random() * others.length)];
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
