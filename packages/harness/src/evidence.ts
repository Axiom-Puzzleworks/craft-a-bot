import {
	createEgressGuard,
	type EgressMode,
	type EvidenceStore,
	type EvidenceStoreInstance,
	type PackRegistry
} from '@craftabot/core';
import type { CredentialSource } from './credentials.js';

/**
 * **The harness's evidence stores** (`58-EVIDENCE-STORE.md` §4.4, WP70):
 * whatever the registry lists (the `evidence` pack is in `defaultPacks`),
 * built behind the same egress guard a sink gets — `declared` allows the
 * store's own host, `none` refuses it and the command reports the refusal.
 */

export function evidenceStoreById(registry: PackRegistry, id: string): EvidenceStore {
	const store = registry.getEvidenceStore(id);
	if (!store) {
		const known = registry
			.listEvidenceStores()
			.map((candidate) => candidate.id)
			.join(', ');
		throw new Error(`unknown evidence store "${id}" — one of ${known}`);
	}
	return store;
}

export function parseEvidenceStoreConfig(store: EvidenceStore, json: string | undefined): unknown {
	let raw: unknown = {};
	if (json !== undefined) {
		try {
			raw = JSON.parse(json);
		} catch {
			throw new Error(`--store-config for ${store.id} is not JSON`);
		}
	}
	const parsed = store.configSchema.safeParse(raw);
	if (!parsed.success) {
		throw new Error(`${store.id} config: ${parsed.error.issues[0]?.message ?? 'invalid'}`);
	}
	return parsed.data;
}

export function buildEvidenceStore(options: {
	store: EvidenceStore;
	config: unknown;
	credentials: CredentialSource;
	fetch?: typeof globalThis.fetch;
	egress?: EgressMode;
	now?: () => number;
}): EvidenceStoreInstance {
	const guard = createEgressGuard({
		mode: options.egress ?? 'declared',
		fetch: options.fetch ?? globalThis.fetch.bind(globalThis)
	});
	guard.allow(options.store.egress(options.config));
	return options.store.create({
		config: options.config,
		fetch: guard.fetch,
		getCredential: (id) => options.credentials.get(id),
		...(options.now ? { now: options.now } : {})
	});
}
