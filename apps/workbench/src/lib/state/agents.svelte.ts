import {
	brickKindsFor,
	buildAgentCard,
	buildKitFile,
	importKitFile,
	localContentReferencedBy,
	validateSpec,
	type AgentRecord,
	type AgentSpecV2,
	type ImportProblem
} from '@craftabot/core';
import { createRegistry, installedBrickKinds, packVersions } from '$lib/packs.js';
import { contentStore } from './content.svelte.js';
import { appStorage } from './app-storage.svelte.js';
import { createBrowserKeyVault } from './keys.js';
import type { Storage } from './storage.js';

/**
 * The Shelf's state (03-UI-UX-DESIGN.md §3): the agents you have made, and the
 * things you can do to them — new, duplicate, bin, import, export.
 */

/**
 * A brand-new bot: a brain and a first card, nothing else. The tutorial adds the rest.
 *
 * Spec v2 since WP14. The seed lives on the bot now rather than on the shelf
 * row, which is what lets an exported bot arrive looking like itself.
 */
export function blankSpec(id: string, now: string): AgentSpecV2 {
	return {
		id,
		name: 'My Very First Agent',
		schemaVersion: 2,
		bricks: [],
		goalCardId: 'starter/say-hello',
		identity: { displayName: 'My Very First Agent', boxArtSeed: id },
		createdAt: now,
		updatedAt: now
	};
}

export interface AgentsStore {
	readonly agents: AgentRecord[];
	readonly loading: boolean;
	load(): Promise<void>;
	create(name?: string): Promise<AgentRecord>;
	duplicate(id: string): Promise<AgentRecord | undefined>;
	/**
	 * Rename a bot from the Shelf, without opening its bench.
	 *
	 * `bench.svelte.ts`'s `rename()` does the same two-field update
	 * (`spec.name` + `spec.identity.displayName`, kept in sync until the last
	 * reader moves to `identity`) but only for the bench's own in-memory spec,
	 * mid-edit-session with undo. This is the same update, direct to storage,
	 * for a bot that is not currently open. A blank or whitespace-only name is
	 * refused rather than saved — `AgentSpecV2.name` is `min(1)`, and a bot
	 * with no name at all is a worse state than the rename never having
	 * happened.
	 */
	rename(id: string, name: string): Promise<AgentRecord | undefined>;
	remove(id: string): Promise<void>;
	exportKit(id: string): Promise<string | undefined>;
	/**
	 * The Agent Card (WP33 stage C, `14-…` §5.8) — a bot's own passport, as its
	 * own file. Deliberately not a kit: `importKitFile` was never built to read
	 * one back in, and offering it through the same "Import kit" control would
	 * promise a round trip this file cannot make.
	 */
	exportAgentCard(id: string): Promise<string | undefined>;
	importKit(
		json: string
	): Promise<{ ok: true; agent: AgentRecord } | { ok: false; problem: ImportProblem }>;
}

export interface AgentsStoreDeps {
	storage?: () => Promise<Storage>;
	newId?: () => string;
	now?: () => string;
}

export function createAgentsStore(deps: AgentsStoreDeps = {}): AgentsStore {
	const storage = deps.storage ?? appStorage;
	const newId = deps.newId ?? (() => crypto.randomUUID());
	// A one-shot read for a timestamp string, not mutable reactive state — a
	// SvelteDate here would be reactive machinery around a value we never keep.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const now = deps.now ?? (() => new Date().toISOString());

	const state = $state<{ agents: AgentRecord[]; loading: boolean }>({ agents: [], loading: false });

	function validationOf(spec: AgentSpecV2) {
		return validateSpec(spec, createRegistry(), {
			hasCredential: (id) => createBrowserKeyVault().get(id) !== undefined
		});
	}

	async function persist(record: AgentRecord): Promise<void> {
		await (await storage()).putAgent(record);
	}

	async function refresh(): Promise<void> {
		const all = await (await storage()).listAgents();
		state.agents = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
	}

	return {
		get agents() {
			return state.agents;
		},
		get loading() {
			return state.loading;
		},

		async load() {
			state.loading = true;
			try {
				await refresh();
			} finally {
				state.loading = false;
			}
		},

		async create(name) {
			const timestamp = now();
			const spec = blankSpec(newId(), timestamp);
			if (name !== undefined) {
				spec.name = name;
				spec.identity.displayName = name;
			}

			const record: AgentRecord = {
				id: spec.id,
				spec,
				lastValidation: validationOf(spec),
				createdAt: timestamp,
				updatedAt: timestamp,
				schemaVersion: 2
			};
			await persist(record);
			await refresh();
			return record;
		},

		async rename(id, name) {
			const trimmed = name.trim();
			if (trimmed === '') return undefined;

			const original = await (await storage()).getAgent(id);
			if (!original) return undefined;

			const timestamp = now();
			const record: AgentRecord = {
				...original,
				spec: {
					...original.spec,
					name: trimmed,
					identity: { ...original.spec.identity, displayName: trimmed },
					updatedAt: timestamp
				},
				updatedAt: timestamp
			};
			await persist(record);
			await refresh();
			return record;
		},

		async duplicate(id) {
			const original = await (await storage()).getAgent(id);
			if (!original) return undefined;

			const timestamp = now();
			const name = `${original.spec.name} (copy)`;
			const copyId = newId();
			const spec: AgentSpecV2 = {
				...original.spec,
				id: copyId,
				name,
				// A copy is a different bot and gets its own box: the same seed
				// would put two indistinguishable lids on the same shelf.
				identity: { displayName: name, boxArtSeed: copyId },
				createdAt: timestamp,
				updatedAt: timestamp
			};

			const record: AgentRecord = {
				...original,
				id: spec.id,
				spec,
				createdAt: timestamp,
				updatedAt: timestamp
			};
			delete record.lastRunId;
			await persist(record);
			await refresh();
			return record;
		},

		async remove(id) {
			await (await storage()).deleteAgent(id);
			await refresh();
		},

		async exportKit(id) {
			const record = await (await storage()).getAgent(id);
			if (!record) return undefined;
			const kit = buildKitFile(record.spec, {
				exportedBy: 'craftabot-workbench/0.0.1',
				requires: {
					core: '>=0.0.1',
					packs: packVersions(),
					// Which pack each brick came from, so a reader missing one is told
					// the brick's name and not merely "you need an expansion".
					brickKinds: brickKindsFor(record.spec, createRegistry())
				},
				// The bot's own cards travel with it (WP46, `34-…` §4.3) — no other machine has them.
				localContent: localContentReferencedBy(record.spec)
					.map((id) => contentStore.records.find((entry) => entry.id === id))
					.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined)
			});
			// Pretty-printed on purpose: a kit file is teaching material, not a blob (07 §1.3).
			return JSON.stringify(kit, null, '\t');
		},

		async exportAgentCard(id) {
			const record = await (await storage()).getAgent(id);
			if (!record) return undefined;
			const card = buildAgentCard(record.spec, createRegistry());
			return JSON.stringify(card, null, '\t');
		},

		async importKit(json) {
			let parsed: unknown;
			try {
				parsed = JSON.parse(json);
			} catch {
				return {
					ok: false,
					problem: { kind: 'invalid-file', message: 'That file is not readable JSON.' }
				};
			}

			const result = importKitFile(parsed, {
				installedPacks: Object.keys(packVersions()),
				installedBrickKinds: installedBrickKinds(),
				existingAgentIds: state.agents.map((agent) => agent.id),
				newId,
				now
			});
			if (!result.ok) return { ok: false, problem: result.problem };

			const timestamp = now();
			const spec = result.imported.spec;
			const record: AgentRecord = {
				id: spec.id,
				spec: {
					...spec,
					// A kit from before identity moved onto the spec has no seed. Mint
					// one from the id it arrived with, which is what the shelf used to
					// do anyway; a bot exported *since* keeps the box it left with.
					identity: {
						...spec.identity,
						boxArtSeed: spec.identity.boxArtSeed === '' ? spec.id : spec.identity.boxArtSeed
					}
				},
				lastValidation: validationOf(spec),
				createdAt: timestamp,
				updatedAt: timestamp,
				schemaVersion: 2
			};
			// Its cards first, so the bot never references a card the store lacks (WP46).
			if (result.imported.localContent.length > 0) {
				await contentStore.saveAll(result.imported.localContent);
			}
			await persist(record);
			await refresh();
			return { ok: true, agent: record };
		}
	};
}

/** The app-wide shelf. Components import this; tests build their own. */
export const agentsStore = createAgentsStore();
