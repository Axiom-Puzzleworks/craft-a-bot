import type { JsonSchema } from './json-schema.js';
import type { ActionId, SenseChannelId, WorldPredicateId } from './ids.js';

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

export interface WorldDefinition {
	id: string; // "starter/playroom"
	name: string;
	layouts: WorldLayout[];
	actions: WorldActionDefinition[];
	senses: WorldSenseDefinition[];
	predicates: Record<WorldPredicateId, string>;
	create(layoutId: string): WorldInstance;
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
}
