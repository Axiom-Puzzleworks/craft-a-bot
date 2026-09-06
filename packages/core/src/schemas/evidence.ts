import { z } from 'zod';
import { canonicalJson } from './cassette.js';
import { contentRecordSchema } from './content.js';
import { storedCampaignReportSchema } from './records.js';
import { traceBundleSchema } from './trace-bundle.js';

/**
 * **Evidence items** (`58-EVIDENCE-STORE.md` §4.1, WP70; `41-…` §6.11,
 * decision D1). The four artefacts a shared evidence store may hold — a
 * trace bundle, a campaign report as the store keeps it, an assurance pack
 * record and a `local/*` content record — and nothing else: the union is
 * closed, and a key, a raw run or a case file outside a bundle cannot be
 * expressed as one. Every item carries one digest by one rule: SHA-256 over
 * the canonical JSON of its payload as pushed, so what a pull returns is
 * checked against what was pushed whatever the kind (`58-…` §2 item 2). A
 * bundle's own `bundleDigest` is verified besides, on import, as a file's is.
 */

export const evidenceKindSchema = z.enum([
	'bundle',
	'campaign-report',
	'assurance-pack',
	'content'
]);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;

const itemBase = {
	/** The artefact's id in the store: a bundle's first run (or group), a report's id, `assurance/<agent>/<generatedAt>`, a content record's `local/…` id. */
	id: z.string().min(1),
	/** SHA-256 hex over `canonicalJson(payload)`. */
	digest: z.string().regex(/^[0-9a-f]{64}$/),
	pushedAt: z.string().datetime(),
	/** The principal who pushed (WP65's `Principal.id`), when the host knows one. */
	pushedBy: z.string().min(1).optional()
};

export const evidenceItemSchema = z.discriminatedUnion('kind', [
	z.object({ ...itemBase, kind: z.literal('bundle'), payload: traceBundleSchema }),
	z.object({
		...itemBase,
		kind: z.literal('campaign-report'),
		payload: storedCampaignReportSchema
	}),
	/** The pack record as `@craftabot/governance` builds it — opaque here, for the reason the campaign report is an envelope. */
	z.object({
		...itemBase,
		kind: z.literal('assurance-pack'),
		payload: z.record(z.string(), z.unknown())
	}),
	z.object({ ...itemBase, kind: z.literal('content'), payload: contentRecordSchema })
]);
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type EvidencePayloadOf<K extends EvidenceKind> = Extract<
	EvidenceItem,
	{ kind: K }
>['payload'];

/** What a store hands back for a push: enough to `verify` later, never the payload. */
export const evidenceReceiptSchema = z.object({
	storeId: z.string().min(1),
	workspace: z.string().min(1),
	kind: evidenceKindSchema,
	id: z.string().min(1),
	digest: z.string().regex(/^[0-9a-f]{64}$/),
	storedAt: z.string().datetime()
});
export type EvidenceReceipt = z.infer<typeof evidenceReceiptSchema>;

export interface EvidenceQuery {
	kind?: EvidenceKind;
	id?: string;
	/** Items pushed strictly after this instant (ISO 8601). */
	since?: string;
	limit?: number;
}

export function parseEvidenceItem(value: unknown): EvidenceItem {
	return evidenceItemSchema.parse(value);
}

/** The one digest rule: SHA-256 hex over the payload's canonical JSON. */
export async function computeEvidenceDigest(payload: unknown): Promise<string> {
	const data = new TextEncoder().encode(canonicalJson(payload));
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/** `true` when the item's payload still digests to the digest it carries. */
export async function verifyEvidenceItem(item: EvidenceItem): Promise<boolean> {
	return (await computeEvidenceDigest(item.payload)) === item.digest;
}

export interface EvidenceItemOptions {
	now?: () => number;
	/** The pushing principal's id. */
	principal?: string;
}

/** Build an item of a kind over a payload, digested. */
export async function evidenceItemFor<K extends EvidenceKind>(
	kind: K,
	id: string,
	payload: EvidencePayloadOf<K>,
	options: EvidenceItemOptions = {}
): Promise<Extract<EvidenceItem, { kind: K }>> {
	const digest = await computeEvidenceDigest(payload);
	const pushedAt = new Date((options.now ?? Date.now)()).toISOString();
	return evidenceItemSchema.parse({
		kind,
		id,
		digest,
		pushedAt,
		...(options.principal !== undefined ? { pushedBy: options.principal } : {}),
		payload
	}) as Extract<EvidenceItem, { kind: K }>;
}

/** The item id an artefact takes (`58-…` §4.1): the same artefact pushed twice lands on the same row. */
export function evidenceIdFor(
	kind: EvidenceKind,
	payload: Record<string, unknown> & { runs?: unknown; group?: unknown; id?: unknown }
): string {
	switch (kind) {
		case 'bundle': {
			const group = payload.group as { record?: { id?: string } } | undefined;
			if (group?.record?.id) return group.record.id;
			const runs = payload.runs as Array<{ run?: { id?: string } }> | undefined;
			const first = runs?.[0]?.run?.id;
			if (!first) throw new Error('a bundle with no run has no evidence id');
			return first;
		}
		case 'assurance-pack': {
			const agent = (payload.agent as { id?: string } | undefined)?.id ?? payload.agentId;
			const generatedAt = payload.generatedAt;
			if (typeof agent !== 'string' || typeof generatedAt !== 'string') {
				throw new Error('an assurance pack names its agent and generatedAt');
			}
			return `assurance/${agent}/${generatedAt}`;
		}
		default: {
			if (typeof payload.id !== 'string' || payload.id === '') {
				throw new Error(`a ${kind} has an id`);
			}
			return payload.id;
		}
	}
}
