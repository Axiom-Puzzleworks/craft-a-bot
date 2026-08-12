import {
	buildKitFile,
	importKitFile,
	validateSpec,
	type AgentRecord,
	type AgentSpec,
	type ImportProblem
} from '@craftabot/core';
import { createRegistry, packVersions } from '$lib/packs.js';
import { appStorage } from './app-storage.svelte.js';
import type { Storage } from './storage.js';

/**
 * The Shelf's state (03-UI-UX-DESIGN.md §3): the agents you have made, and the
 * things you can do to them — new, duplicate, bin, import, export.
 */

/** A brand-new bot: a brain and a first card, nothing else. The tutorial adds the rest. */
export function blankSpec(id: string, now: string): AgentSpec {
	return {
		id,
		name: 'My Very First Agent',
		bricks: {},
		goalCardId: 'starter/say-hello',
		createdAt: now,
		updatedAt: now,
		schemaVersion: 1
	};
}

export interface AgentsStore {
	readonly agents: AgentRecord[];
	readonly loading: boolean;
	load(): Promise<void>;
	create(name?: string): Promise<AgentRecord>;
	duplicate(id: string): Promise<AgentRecord | undefined>;
	remove(id: string): Promise<void>;
	exportKit(id: string): Promise<string | undefined>;
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

	function validationOf(spec: AgentSpec) {
		return validateSpec(spec, createRegistry());
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
			if (name !== undefined) spec.name = name;

			const record: AgentRecord = {
				id: spec.id,
				spec,
				// Seeded from the id so a bot's box art never changes under it.
				boxArtSeed: spec.id,
				lastValidation: validationOf(spec),
				createdAt: timestamp,
				updatedAt: timestamp,
				schemaVersion: 1
			};
			await persist(record);
			await refresh();
			return record;
		},

		async duplicate(id) {
			const original = await (await storage()).getAgent(id);
			if (!original) return undefined;

			const timestamp = now();
			const spec: AgentSpec = {
				...original.spec,
				id: newId(),
				name: `${original.spec.name} (copy)`,
				createdAt: timestamp,
				updatedAt: timestamp
			};
			const record: AgentRecord = {
				...original,
				id: spec.id,
				spec,
				boxArtSeed: spec.id,
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
				requires: { core: '>=0.0.1', packs: packVersions() }
			});
			// Pretty-printed on purpose: a kit file is teaching material, not a blob (07 §1.3).
			return JSON.stringify(kit, null, '\t');
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
				existingAgentIds: state.agents.map((agent) => agent.id),
				newId,
				now
			});
			if (!result.ok) return { ok: false, problem: result.problem };

			const timestamp = now();
			const record: AgentRecord = {
				id: result.imported.spec.id,
				spec: result.imported.spec,
				boxArtSeed: result.imported.spec.id,
				lastValidation: validationOf(result.imported.spec),
				createdAt: timestamp,
				updatedAt: timestamp,
				schemaVersion: 1
			};
			await persist(record);
			await refresh();
			return { ok: true, agent: record };
		}
	};
}

/** The app-wide shelf. Components import this; tests build their own. */
export const agentsStore = createAgentsStore();
