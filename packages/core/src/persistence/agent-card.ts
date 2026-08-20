import { migrateBrickConfig } from '../brick-config.js';
import type { PackRegistry } from '../pack-registry.js';
import { toSpecV2, type AnyAgentSpec, type FittedBrick } from '../schemas/agent-spec-v2.js';
import type { SlotId } from '../types/brick.js';
import { brickKindsFor } from './kit-export.js';

/**
 * The Agent Card (WP33 stage A; `14-…` §5.8, "your robot's passport"; `19-…`
 * #29) — every fitted brick, in its own words, and which pack each one came
 * from. Unlike a kit file (`kit-export.ts`), this is a one-way transparency
 * artefact, not a re-importable spec: it carries nothing a reader could feed
 * back into `importKitFile`, only what a reader wants to know about a bot
 * someone else built.
 *
 * Deliberately reuses `BrickKindDefinition.describeFitted` for every brick's
 * own summary — the same "each brick describes itself" mechanism
 * `describeFittedBricks` (`session/prompt.ts`) already uses for the system
 * prompt — rather than a bespoke "permissions" field that would need core to
 * understand a pack's own config shape (hard rule 4). A Safety Brick's own
 * `describeFitted` already says what it is watching over; that is this
 * card's answer to "permissions" too, not a second interpretation of the
 * same config.
 */

export interface AgentCardBrick {
	slot: SlotId;
	/** The registered kind id, qualified: `starter/llm`. */
	kind: string;
	/** The kind's own toy name, or the raw kind id when it cannot be resolved. */
	name: string;
	/** How this brick describes itself as configured, in the toy's own words. */
	description: string;
}

export interface AgentCard {
	name: string;
	goalCardId: string;
	bricks: AgentCardBrick[];
	provenance: {
		/** Pack id → version, for every pack a fitted brick actually came from. */
		packs: Record<string, string>;
		/** Brick kind id → the pack that provides it (`brickKindsFor`, kit-export.ts). */
		brickKinds: Record<string, string>;
	};
}

/**
 * One brick's own card entry, degrading honestly when its kind is not
 * registered (an uninstalled pack) rather than dropping the brick — a card's
 * job is to say what a bot actually carries, not to hide a brick this reader
 * happens not to have. Mirrors `describeFittedBricks`'s own migrate-then-
 * validate-then-describe steps, so a card and the bot's own system prompt
 * never disagree about what one brick says about itself.
 */
function describeBrick(brick: FittedBrick, registry: PackRegistry): AgentCardBrick {
	const kind = registry.getBrickKind(brick.kind);
	if (!kind || kind.slot !== brick.slot) {
		return { slot: brick.slot, kind: brick.kind, name: brick.kind, description: brick.kind };
	}

	const migrated = migrateBrickConfig(brick.config, brick.configVersion, kind);
	const parsed = kind.configSchema.safeParse(migrated);
	const description = parsed.success
		? (kind.describeFitted?.(parsed.data) ?? kind.name)
		: kind.name;

	return { slot: brick.slot, kind: brick.kind, name: kind.name, description };
}

/**
 * A bot's own passport, derived entirely from its spec and the registry —
 * nothing stored, nothing new to keep in step with the spec it reads.
 */
export function buildAgentCard(spec: AnyAgentSpec, registry: PackRegistry): AgentCard {
	const v2 = toSpecV2(spec);
	const brickKinds = brickKindsFor(v2, registry);
	const packVersions = new Map(registry.listPacks().map((pack) => [pack.id, pack.version]));

	const packs: Record<string, string> = {};
	for (const packId of new Set(Object.values(brickKinds))) {
		const version = packVersions.get(packId);
		/* istanbul ignore next -- brickKinds only ever names a pack registerPack itself added to packVersions */
		if (version !== undefined) packs[packId] = version;
	}

	return {
		name: v2.name,
		goalCardId: v2.goalCardId,
		bricks: v2.bricks.map((brick) => describeBrick(brick, registry)),
		provenance: { packs, brickKinds }
	};
}
