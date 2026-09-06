import type {
	AgentSpec,
	GoalCardDefinition,
	PackRegistry,
	WorldDefinition,
	WorldInstance
} from '@craftabot/core';
import { seatedCounterpartOf, type CounterpartScript } from '@craftabot/desk';

/**
 * **The counterpart seat** (WP64, `56-LIVE-COUNTERPARTS.md` §4.1; moved
 * here from the harness's `run-duo.ts`, WP55 `46-…` §4.6): how a desk's
 * script becomes a second member of a `SessionGroup` — the visitor's spec,
 * with the conversation and its brief for senses, `say` and `hang-up` for
 * actions, and the script's persona as its personality. The harness's
 * `run --counterpart` and a campaign's live-seat cell build the same seat
 * from these two functions.
 */

/** The desk a card plays on, or why this card cannot seat a visitor. */
export function deskFor(
	registry: PackRegistry,
	goalCardId: string
): { card: GoalCardDefinition; world: WorldDefinition } {
	const card = registry.getGoalCard(goalCardId);
	const world = card ? registry.getWorld(card.worldId) : undefined;
	if (!card || !world) throw new Error(`no goal card '${goalCardId}' is installed`);
	if (world.view !== 'desk') {
		throw new Error(`a counterpart needs a desk; '${goalCardId}' plays in '${world.id}', a room`);
	}
	return { card, world };
}

/**
 * The desk's script, or why this card cannot seat a visitor. With an
 * instance, the script *seated* in it — the case's own person, generated
 * with the case (`56-…` §2 item 10); without one, the desk's static script,
 * which the Front Desk has and the bank's desks do not.
 */
export function counterpartScriptFor(
	registry: PackRegistry,
	goalCardId: string,
	instance?: WorldInstance
): { script: CounterpartScript; world: WorldDefinition } {
	const { world } = deskFor(registry, goalCardId);
	const script =
		(instance ? seatedCounterpartOf(instance) : undefined) ??
		(world as { spec?: { counterpart?: CounterpartScript } }).spec?.counterpart;
	if (!script) throw new Error(`the desk '${world.id}' has no counterpart script to seat`);
	return { script, world };
}

/** The visitor's spec (`46-…` §4.6): the conversation and its brief, `say` and `hang-up`, the persona as its personality. */
export function counterpartSpec(
	script: CounterpartScript,
	goalCardId: string,
	worldId: string,
	cartridgeId: string,
	id: string,
	createdAt: string
): AgentSpec {
	return {
		id,
		name: script.name,
		bricks: {
			llm: { cartridgeId, temperature: 0, maxTokens: 256, personality: script.persona },
			// Qualified with the desk's own id: the starter's Sense and Actions
			// bricks qualify a bare id with the Playroom's (`12-…` D20), which
			// would leave the visitor deaf at the desk.
			sense: { channels: [`${worldId}/conversation`, `${worldId}/brief`] },
			actions: { enabled: [`${worldId}/say`, `${worldId}/hang-up`] },
			memory: { windowSize: 10, notebook: false }
		},
		goalCardId,
		createdAt,
		updatedAt: createdAt,
		schemaVersion: 1
	};
}
