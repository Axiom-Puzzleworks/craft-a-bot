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

/** What a Sense brick yields for a tick — plain text for the prompt, structured data for the UI (02 §8). */
export interface Observation {
	channels: SenseChannelId[];
	text: string;
	/**
	 * A one-line version of `text`, for the memory window.
	 *
	 * Remembering the full observation turned the prompt into wallpaper: each one
	 * is a dozen lines, most of them "nothing but rug", and a window of ten made
	 * the history **86% of the prompt** while the goal and the current situation
	 * shrank to a footnote. The world writes the short form because only the
	 * world knows which of its own lines carry information.
	 *
	 * Optional: a world that omits it simply gets the full text remembered, as
	 * before.
	 */
	summary?: string;
	data?: Record<string, unknown>;
}

export interface ActionCall {
	name: ActionId;
	arguments: unknown;
}

export interface ActionResult {
	ok: boolean;
	narration: string;
	stateDiff?: unknown;
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
	 */
	describeProgress?(predicate: WorldPredicateId): string | undefined;
}
