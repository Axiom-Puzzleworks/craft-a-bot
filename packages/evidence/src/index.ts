import type { EvidenceStore, PackManifest } from '@craftabot/core';
import { memoryEvidenceStore } from './memory.js';
import { supabaseEvidenceStore } from './supabase.js';

/**
 * **`@craftabot/evidence`** (`58-EVIDENCE-STORE.md`, WP70; `41-…` §6.11, D1):
 * the stores behind the `EvidenceStore` contract `core` declares — a sync
 * target for artefacts only, never a key, never the source of truth, never
 * required. Depends on `core` and `zod` alone.
 */

export {
	createMemoryEvidenceInstance,
	memoryEvidenceConfigSchema,
	memoryEvidenceStore,
	resetMemoryEvidence,
	type MemoryEvidenceConfig
} from './memory.js';
export {
	EVIDENCE_TABLES,
	SUPABASE_EVIDENCE_CREDENTIAL_ID,
	SUPABASE_EVIDENCE_STORE_ID,
	createSupabaseEvidenceInstance,
	supabaseEvidenceConfigSchema,
	supabaseEvidenceStore,
	type SupabaseEvidenceConfig
} from './supabase.js';

/** The stores a host lists: the Supabase adapter (§4.3) and the memory store (§4.2). */
export const evidenceStores: EvidenceStore[] = [supabaseEvidenceStore, memoryEvidenceStore];

/** The `evidence` pack: the stores as registered content, for both hosts. */
export const evidencePack: PackManifest = {
	id: 'evidence',
	name: 'Evidence',
	version: '0.0.1',
	requiresCore: '>=1.0.0',
	evidenceStores
};
