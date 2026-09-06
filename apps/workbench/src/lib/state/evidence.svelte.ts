import { createEgressGuard, type EvidenceStore, type EvidenceStoreInstance } from '@craftabot/core';
import { evidenceStores } from '@craftabot/evidence';
import { z } from 'zod';
import { createBrowserKeyVault } from './keys.js';

/**
 * **Configured evidence stores** (`58-EVIDENCE-STORE.md` §4.5, WP70): the
 * Workshop's Evidence screen is where a store is configured (the harness
 * takes `--store-config`; the Kit never sees one). Each configuration is a
 * store id and its config, kept in `localStorage` under `cab.evidence.v1` —
 * never the token, which lives in the vault under the store's credential
 * id. An instance is built behind an egress guard from the store's own
 * declaration, the vault answering for the token. Nothing here runs unless
 * a person pushes or pulls; the store is never on a run's path.
 */

export const EVIDENCE_STORAGE_KEY = 'cab.evidence.v1';

export const evidenceConfigurationSchema = z.object({
	storeId: z.string().min(1),
	config: z.unknown()
});
export type EvidenceConfiguration = z.infer<typeof evidenceConfigurationSchema>;

const fileSchema = z.object({
	schemaVersion: z.literal(1),
	stores: z.array(evidenceConfigurationSchema)
});

export interface WebStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface EvidenceStoresStore {
	readonly configurations: readonly EvidenceConfiguration[];
	readonly available: readonly EvidenceStore[];
	/** `true` when at least one store is configured — what the push controls elsewhere key on. */
	readonly configured: boolean;
	storeById(id: string): EvidenceStore | undefined;
	set(configuration: EvidenceConfiguration): void;
	remove(storeId: string): void;
	/** A configured store, built fresh behind its egress guard; `undefined` when not configured. */
	instance(storeId: string): EvidenceStoreInstance | undefined;
}

export function createEvidenceStoresStore(
	options: {
		storage?: WebStorageLike;
		stores?: EvidenceStore[];
		fetch?: typeof globalThis.fetch;
	} = {}
): EvidenceStoresStore {
	const storage =
		options.storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
	const available = options.stores ?? evidenceStores;
	const baseFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

	function load(): EvidenceConfiguration[] {
		try {
			const raw = storage?.getItem(EVIDENCE_STORAGE_KEY);
			if (!raw) return [];
			const parsed = fileSchema.safeParse(JSON.parse(raw));
			return parsed.success ? parsed.data.stores : [];
		} catch {
			return [];
		}
	}

	let configurations = $state<EvidenceConfiguration[]>(load());
	const configured = $derived(configurations.length > 0);

	function persist(): void {
		storage?.setItem(
			EVIDENCE_STORAGE_KEY,
			JSON.stringify({ schemaVersion: 1, stores: $state.snapshot(configurations) })
		);
	}

	return {
		get configurations() {
			return configurations;
		},
		available,
		get configured() {
			return configured;
		},
		storeById: (id) => available.find((store) => store.id === id),
		set(configuration) {
			configurations = [
				...configurations.filter((entry) => entry.storeId !== configuration.storeId),
				configuration
			];
			persist();
		},
		remove(storeId) {
			configurations = configurations.filter((entry) => entry.storeId !== storeId);
			persist();
		},
		instance(storeId) {
			const entry = configurations.find((candidate) => candidate.storeId === storeId);
			const store = available.find((candidate) => candidate.id === storeId);
			if (!entry || !store || !store.configSchema.safeParse(entry.config).success) return undefined;
			// The store says where it will call for this config; the guard allows exactly that (WP41's seam).
			const guard = createEgressGuard({ mode: 'declared', fetch: baseFetch });
			guard.allow(store.egress(entry.config));
			return store.create({
				config: entry.config,
				fetch: guard.fetch,
				getCredential: (id) => createBrowserKeyVault().get(id)
			});
		}
	};
}

/** The app-wide store. Components import this; tests build their own. */
export const evidenceStoresStore = createEvidenceStoresStore();
