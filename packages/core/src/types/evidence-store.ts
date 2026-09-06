import type { z } from 'zod';
import type { EvidenceItem, EvidenceQuery, EvidenceReceipt } from '../schemas/evidence.js';
import type { EgressDeclaration } from './guardrail-service.js';
import type { BrickKindDefinition } from './brick.js';

/**
 * **The evidence store contract** (`58-EVIDENCE-STORE.md` §4.1, WP70;
 * `41-…` §6.11, decision D1). A store is a sync target for artefacts only —
 * never a key, never the source of truth, never required. It lives here
 * beside `TraceSink` for the sink's reason: `PackManifest.evidenceStores`
 * and the testkit name it without depending on `@craftabot/evidence`, which
 * implements it. Unlike a sink a store *answers*: `push` returns a receipt
 * and rejects on failure (with a message that never carries the credential),
 * `pull` streams items the caller verifies, `verify` says whether a receipt
 * still names what the store holds. A store is never on a run's path.
 */

export interface EvidenceStoreInstance {
	/** Store the item (replacing one with the same id) and say what was stored. Rejects on failure. */
	push(item: EvidenceItem): Promise<EvidenceReceipt>;
	/** Every item matching the query, in `pushedAt` then id order. Each is validated on the way out; the caller checks the digest. */
	pull(query: EvidenceQuery): AsyncIterable<EvidenceItem>;
	/** `true` when the store holds the receipt's id at the receipt's digest; `false` when missing or changed; rejects only when unreachable. */
	verify(receipt: EvidenceReceipt): Promise<boolean>;
}

export interface CreateEvidenceStoreOptions {
	config: unknown;
	fetch: typeof globalThis.fetch;
	getCredential(id: string): string | undefined;
	now?: () => number;
}

export interface EvidenceStore {
	/** `evidence/supabase`, `evidence/memory` … */
	id: string;
	name: string;
	description: string;
	credential?: BrickKindDefinition['credential'];
	/** Where this store will call, for the configuration given. */
	egress(config: unknown): EgressDeclaration[];
	configSchema: z.ZodType<unknown>;
	create(options: CreateEvidenceStoreOptions): EvidenceStoreInstance;
}

/** Why a store is not fit to register — the sink's shape check, for a store. */
export function describeEvidenceStoreProblems(store: EvidenceStore): string[] {
	const problems: string[] = [];
	if (typeof store.id !== 'string' || store.id.trim() === '') problems.push('has no id');
	if (typeof store.name !== 'string' || store.name.trim() === '') problems.push('has no name');
	if (typeof store.egress !== 'function') problems.push('declares no egress');
	if (typeof store.create !== 'function') problems.push('cannot be created');
	if (store.configSchema === undefined) problems.push('has no config schema');
	return problems;
}
