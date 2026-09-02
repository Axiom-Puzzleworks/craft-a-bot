import type {
	AgentSpecV2,
	CartridgeDefinition,
	GuardrailService,
	PolicyCard,
	ToolDefinition,
	WorldActionDefinition
} from '@craftabot/core';

/**
 * What every brick panel is given (WP14 slice 4a).
 *
 * One shape for all of them, hand-written override and schema-driven fallback
 * alike, so `BrickPanel` can pick between them without knowing which it got.
 *
 * The lists are resolved by the bench rather than by each panel because two of
 * them depend on the *goal card*: a sense channel and a world action belong to
 * the world the chosen card names, and swapping the card changes them.
 */
export interface BrickPanelProps {
	/** This brick's config, as stored. Untyped here; each panel knows its own. */
	config: Record<string, unknown>;
	/**
	 * The whole bot, for the rare panel that must read another socket.
	 *
	 * Exactly one shipped panel does — the tool belt, which warns that a
	 * notebook tool has no notebook to write in — and it reads through core's
	 * memory *slot contract* rather than by brick name, so any memory brick
	 * answers it. This is the cross-brick case `ControlHints` deliberately
	 * cannot express, and the reason per-kind overrides still exist.
	 */
	spec: AgentSpecV2;
	cartridges: CartridgeDefinition[];
	tools: ToolDefinition[];
	senseChannels: { id: string; name: string; description: string }[];
	/** Named `worldActions` because `actions` is the snippet slot `Panel` expects. */
	worldActions: WorldActionDefinition[];
	/** Every policy card an installed pack ships (`14-…` §4.6, WP22). */
	policyCards: PolicyCard[];
	/** Every hosted guardrail service an installed pack ships (`29-…` §4.6, WP39). */
	guardrailServices: GuardrailService[];
	/** A patch merged into this brick's config. */
	onupdate: (patch: Record<string, unknown>) => void;
}

/** Add or remove an id from a checklist-backed array, without duplicates. */
export function toggle(list: readonly string[], id: string, on: boolean): string[] {
	return on ? [...new Set([...list, id])] : list.filter((entry) => entry !== id);
}
