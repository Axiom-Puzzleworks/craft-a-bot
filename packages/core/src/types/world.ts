import type { Injection } from '../schemas/scenario.js';
import type { JsonSchema } from './json-schema.js';
import type { ActionId, SenseChannelId, WorldPredicateId } from './ids.js';
import type { RiskTier } from '../schemas/risk-tier.js';

/**
 * Simulated worlds (02-AGENT-MODEL.md §4). The Playroom (pack-starter, WP2) is
 * the only V1 instance; the interface is kept general so future worlds are packs.
 * `WorldState` stays an opaque, JSON-serialisable blob at this stage — its real
 * shape is defined by each world (the Playroom's grid model lands in WP2).
 */
export type WorldState = Record<string, unknown>;

export interface WorldLayout {
	id: string;
	name: string;
	initialState: WorldState;
}

export interface WorldActionDefinition {
	id: ActionId;
	name: string;
	description: string;
	parameters: JsonSchema;
	/**
	 * How consequential this action is (`14-…` §4.5, WP24) — the signal a
	 * Safety brick set to `approval: 'risky'` pauses on. Absent means
	 * `'observe'`: a world that says nothing about an action's risk is not
	 * asking anyone to sign off on it.
	 */
	riskTier?: RiskTier;
	/**
	 * A successful call of this action is progress (WP45, `33-…` §4.2): the
	 * no-repetition guardrail never counts it as a repeat. The world says so;
	 * governance stops knowing any action's name.
	 */
	progress?: boolean;
}

export interface WorldSenseDefinition {
	id: SenseChannelId;
	name: string;
	description: string;
}

/**
 * `Observation` and `ActionResult` are defined once, in Zod, and inferred here
 * (E5, `14-…` §3). They cross the trace boundary on every tick, so the schema
 * is the type — see `schemas/shared.ts` for the shapes and the reasoning.
 */
import type { ActionResult, Observation } from '../schemas/shared.js';
export type { ActionResult, Observation };

export interface ActionCall {
	name: ActionId;
	arguments: unknown;
}

/**
 * How a host draws a world's state (WP53, `43-DESK-WORLDS.md` §4.1): a room
 * (`GridWorldState`) or a desk (`DeskWorldState`, `types/desk-world.ts`).
 */
export type WorldViewKind = 'grid' | 'desk';

/**
 * What a session hands a world at `create` (WP53 stage B, `43-DESK-WORLDS.md`
 * §4.4). `random` is the session's own seeded stream, so a world whose
 * layout is *generated* — a desk's case — varies by seed and replays by
 * seed. A caller that passes nothing (every test written before, the
 * conformance kit) gets whatever the world does without one; the grid
 * worlds ignore it, a desk falls back to a fixed seed.
 */
export interface WorldCreateOptions {
	random?: () => number;
}

export interface WorldDefinition {
	id: string; // "starter/playroom"
	name: string;
	/**
	 * How a host draws this world's state. `'grid'` is every world written
	 * before this field existed (`GridWorldState`); `'desk'` is a business
	 * world (`DeskWorldState`). A host that knows neither draws the snapshot
	 * as JSON and says so. Optional; absent means `'grid'`.
	 */
	view?: WorldViewKind;
	layouts: WorldLayout[];
	actions: WorldActionDefinition[];
	senses: WorldSenseDefinition[];
	predicates: Record<WorldPredicateId, string>;
	/** The second argument is optional and additive (WP53): a world that takes only the layout is still a world. */
	create(layoutId: string, options?: WorldCreateOptions): WorldInstance;
}

/**
 * How a world tells agents apart (WP29, `23-MULTI-AGENT-DESIGN.md` §4.1).
 *
 * Deliberately tiny — an identity, not a capability object. A world learns
 * *who* is asking; *what bricks they have fitted* stays entirely inside the
 * session that owns that agent, exactly as it does for a solo bot today.
 */
export interface AgentHandle {
	/** The spec's own id — the same value stamped on the agent's events (E10). */
	agentId: string;
	/** The bot's display name, for narration that names actors ("Robo moved east"). */
	name: string;
}

export interface WorldInstance {
	snapshot(): WorldState;
	observe(channels: SenseChannelId[]): Observation;
	perform(action: ActionCall): ActionResult;
	test(predicate: WorldPredicateId): boolean;
	reset(): void;
	/**
	 * Deliver a user message into the world, for worlds with a "hearing"-style
	 * sense channel (the Playroom's chat bubble, 02-AGENT-MODEL.md §2.4).
	 * Optional: worlds the user cannot talk to simply omit it. Exists so the UI
	 * never has to mutate world state directly (05-TECH-STACK.md §4).
	 */
	receiveInput?(text: string): void;
	/**
	 * One line on how far along the goal is — "one block is in the toy chest, two
	 * still out". Optional.
	 *
	 * Without it an agent has to re-derive its own progress from the history
	 * every single turn, which is both the expensive way and the unreliable one.
	 * Worlds that cannot describe partial progress return undefined and nothing
	 * is added to the prompt.
	 *
	 * **It is given the bot's sense channels and must respect them.** Progress is
	 * derived from world state, so a line like "two blocks are still out" is
	 * perception, not book-keeping — and handing it to a bot with no Sense brick
	 * told it, in consecutive sentences, that it had no idea what was around it
	 * and exactly where all three blocks were. The world decides what each
	 * channel entitles the bot to know, because only the world knows what its own
	 * channels mean.
	 */
	describeProgress?(
		predicate: WorldPredicateId,
		channels: readonly SenseChannelId[]
	): string | undefined;
	/**
	 * Multi-agent opt-in (WP29, `23-…` §4.2). A world that can host several
	 * agents returns a facade bound to one of them: the facade is itself a
	 * `WorldInstance` whose `observe`/`perform`/`test`/`describeProgress` act
	 * *as that agent* over the shared state. Calling it again with the same
	 * handle returns a facade for the same seat.
	 *
	 * A world that omits this hosts exactly one robot — every world written
	 * before WP29, and any world that never opts in. `SessionGroup` refuses
	 * such a world with a plain error rather than pretending it can host a
	 * group; nothing about a single-agent session ever calls this method, so
	 * a world's own behaviour is unchanged whether or not it implements it.
	 */
	forAgent?(handle: AgentHandle): WorldInstance;
	/**
	 * Per-agent config a fitted brick contributes, keyed by whichever
	 * sense-channel or action id it concerns (WP31 stage F,
	 * `types/brick.ts`'s own `BrickRuntime.contributeWorldConfig`).
	 *
	 * Called at most once, right after the session builds its runtimes and
	 * before the first tick — never per-call, because the config it carries
	 * (the Radio brick's own `channel`/`allowFrom`) is fixed for the spec's
	 * whole lifetime. `AgentHandle` stays identity-only; this is the separate,
	 * explicit door such config actually crosses, so that boundary never has
	 * to bend to let a brick's own settings reach the world. A world that
	 * omits this simply never receives any — every world written before this
	 * stage, and any brick that never calls `contributeWorldConfig`.
	 */
	configure?(config: Record<string, unknown>): void;
	/**
	 * Deliver a scenario's injection through a door this world already has
	 * (`32-SCENARIOS.md` §4.1, WP44): a line overheard, a manual entry, a
	 * tool's answer, a radio message. Optional: a world without such doors
	 * omits it, and a scenario carrying injections is refused before the run
	 * with the `world-cannot-inject` problem, never silently dropped.
	 */
	inject?(injection: Injection): void;
}
