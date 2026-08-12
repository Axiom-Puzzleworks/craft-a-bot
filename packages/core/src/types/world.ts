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
}
