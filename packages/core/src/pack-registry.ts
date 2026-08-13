import type {
	BrickDefinition,
	CartridgeDefinition,
	GoalCardDefinition,
	GuardrailDefinition,
	PackManifest,
	PackManifestMetadata
} from './schemas/pack-manifest.js';
import type { ToolDefinition } from './types/tool.js';
import type {
	WorldActionDefinition,
	WorldDefinition,
	WorldSenseDefinition
} from './types/world.js';

/**
 * Resolves cartridge/world/tool/card ids (02-AGENT-MODEL.md §6) from
 * registered packs. Content ids are namespaced `"{packId}/{localId}"`
 * (01-ARCHITECTURE.md §4) — a pack "cannot patch another pack's content",
 * so a colliding content id across two packs is a loud registration error,
 * never a silent overwrite (10-CODING-STANDARDS.md §1).
 */
export interface PackRegistry {
	registerPack(manifest: PackManifest): void;
	getBrick(id: string): BrickDefinition | undefined;
	getTool(id: string): ToolDefinition | undefined;
	getCartridge(id: string): CartridgeDefinition | undefined;
	getGoalCard(id: string): GoalCardDefinition | undefined;
	getWorld(id: string): WorldDefinition | undefined;
	getGuardrail(id: string): GuardrailDefinition | undefined;
	/** Sense channels are declared per-world (02-AGENT-MODEL.md §4); this searches every registered world. */
	getSenseChannel(id: string): WorldSenseDefinition | undefined;
	/** Actions are declared per-world; this searches every registered world. */
	getAction(id: string): WorldActionDefinition | undefined;
	listPacks(): PackManifestMetadata[];
	listTools(): ToolDefinition[];
	listCartridges(): CartridgeDefinition[];
	listGoalCards(): GoalCardDefinition[];
	listWorlds(): WorldDefinition[];
}

export function createPackRegistry(): PackRegistry {
	const packs = new Map<string, PackManifestMetadata>();
	const bricks = new Map<string, BrickDefinition>();
	const tools = new Map<string, ToolDefinition>();
	const cartridges = new Map<string, CartridgeDefinition>();
	const goalCards = new Map<string, GoalCardDefinition>();
	const worlds = new Map<string, WorldDefinition>();
	const guardrails = new Map<string, GuardrailDefinition>();

	function insertUnique<T>(map: Map<string, T>, id: string, value: T, kind: string): void {
		if (map.has(id)) {
			throw new Error(`Pack registration conflict: ${kind} id "${id}" is already registered.`);
		}
		map.set(id, value);
	}

	function registerPack(manifest: PackManifest): void {
		if (packs.has(manifest.id)) {
			throw new Error(`Pack "${manifest.id}" is already registered.`);
		}
		packs.set(manifest.id, {
			id: manifest.id,
			name: manifest.name,
			version: manifest.version,
			requiresCore: manifest.requiresCore
		});
		for (const brick of manifest.bricks ?? []) insertUnique(bricks, brick.id, brick, 'brick');
		for (const tool of manifest.tools ?? []) insertUnique(tools, tool.id, tool, 'tool');
		for (const cartridge of manifest.cartridges ?? [])
			insertUnique(cartridges, cartridge.id, cartridge, 'cartridge');
		for (const goalCard of manifest.goalCards ?? [])
			insertUnique(goalCards, goalCard.id, goalCard, 'goal card');
		for (const world of manifest.worlds ?? []) insertUnique(worlds, world.id, world, 'world');
		for (const guardrail of manifest.guardrails ?? [])
			insertUnique(guardrails, guardrail.id, guardrail, 'guardrail');
	}

	/** The last segment of a content id — the name a world uses internally. */
	function localName(id: string): string {
		const lastSlash = id.lastIndexOf('/');
		return lastSlash === -1 ? id : id.slice(lastSlash + 1);
	}

	/**
	 * Look content up by its qualified id, falling back to its bare local name
	 * (E6, `14-…` §3).
	 *
	 * World actions and senses were registered unqualified until WP13, so specs
	 * on people's shelves name them `move` and `sight`. Those bots keep working:
	 * a bare name resolves as long as **exactly one** piece of content answers
	 * to it. The moment two worlds ship a `move`, the bare name resolves to
	 * neither and the build check says so — which is the honest answer, and the
	 * failure D4 describes made silently.
	 */
	function findByIdOrLocalName<T extends { id: string }>(
		candidates: T[],
		id: string
	): T | undefined {
		const exact = candidates.find((candidate) => candidate.id === id);
		if (exact) return exact;

		const byLocal = candidates.filter((candidate) => localName(candidate.id) === id);
		return byLocal.length === 1 ? byLocal[0] : undefined;
	}

	function getSenseChannel(id: string): WorldSenseDefinition | undefined {
		return findByIdOrLocalName(
			[...worlds.values()].flatMap((world) => world.senses),
			id
		);
	}

	function getAction(id: string): WorldActionDefinition | undefined {
		return findByIdOrLocalName(
			[...worlds.values()].flatMap((world) => world.actions),
			id
		);
	}

	return {
		registerPack,
		getBrick: (id) => bricks.get(id),
		getTool: (id) => tools.get(id),
		getCartridge: (id) => cartridges.get(id),
		getGoalCard: (id) => goalCards.get(id),
		getWorld: (id) => worlds.get(id),
		getGuardrail: (id) => guardrails.get(id),
		getSenseChannel,
		getAction,
		listPacks: () => [...packs.values()],
		listTools: () => [...tools.values()],
		listCartridges: () => [...cartridges.values()],
		listGoalCards: () => [...goalCards.values()],
		listWorlds: () => [...worlds.values()]
	};
}
