import {
	evidenceItemSchema,
	type EgressDeclaration,
	type EvidenceItem,
	type EvidenceKind,
	type EvidenceQuery,
	type EvidenceReceipt,
	type EvidenceStore,
	type EvidenceStoreInstance
} from '@craftabot/core';
import { z } from 'zod';

/**
 * **`evidence/supabase`** (`58-EVIDENCE-STORE.md` §4.3, WP70; `41-…` §6.11,
 * D1; `01-…` §6): PostgREST over `fetch`, no client library. A table per
 * artefact kind, every row keyed by `(workspace, id)`, row-level security
 * letting a workspace token at its own rows only. The token is the
 * credential (`evidence-supabase`, a bearer token from the vault or
 * `CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE`); the project's anon key is
 * configuration, publishable by Supabase's design. Neither ever appears in
 * a URL or an error: a transport failure is reported in this file's own
 * words, and a PostgREST error by its status and its `message` alone.
 * `docs/evidence-setup.md` provisions the tables and mints the token.
 */

export const SUPABASE_EVIDENCE_STORE_ID = 'evidence/supabase';
export const SUPABASE_EVIDENCE_CREDENTIAL_ID = 'evidence-supabase';

export const supabaseEvidenceConfigSchema = z.object({
	/** The project URL: `https://<ref>.supabase.co`, or `http://127.0.0.1:54321` under `supabase start`. */
	url: z.string().url(),
	/** The project's anon (publishable) key — sent as `apikey`; RLS, not secrecy, guards the rows. */
	anonKey: z.string().min(1),
	/** The workspace the token is minted for; every row carries it. */
	workspace: z.string().min(1)
});
export type SupabaseEvidenceConfig = z.infer<typeof supabaseEvidenceConfigSchema>;

/** The table each kind lives in (`58-…` §4.3). */
export const EVIDENCE_TABLES: Record<EvidenceKind, string> = {
	bundle: 'evidence_bundles',
	'campaign-report': 'evidence_campaign_reports',
	'assurance-pack': 'evidence_assurance_packs',
	content: 'evidence_content',
	'workflow-run': 'evidence_workflow_runs',
	'bank-run': 'evidence_bank_runs'
};
const KINDS: EvidenceKind[] = [
	'bundle',
	'campaign-report',
	'assurance-pack',
	'content',
	'workflow-run',
	'bank-run'
];

const rowSchema = z.object({
	id: z.string().min(1),
	digest: z.string().min(1),
	pushed_at: z.string(),
	pushed_by: z.string().nullable().optional(),
	payload: z.unknown()
});

function hostOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function restUrl(base: string, table: string, params: Record<string, string>): string {
	const url = new URL(`rest/v1/${table}`, base.endsWith('/') ? base : `${base}/`);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
	return url.toString();
}

/** PostgREST's `message` from an error body, kept short; never the request. */
async function errorMessage(response: Response): Promise<string> {
	let detail = '';
	try {
		const body = (await response.json()) as { message?: unknown };
		if (typeof body.message === 'string') detail = body.message.slice(0, 200);
	} catch {
		// no body, or not JSON — the status is enough
	}
	return `the evidence store answered ${response.status}${detail ? `: ${detail}` : ''}`;
}

export function createSupabaseEvidenceInstance(options: {
	config: SupabaseEvidenceConfig;
	fetch: typeof globalThis.fetch;
	getCredential(id: string): string | undefined;
	now?: () => number;
}): EvidenceStoreInstance {
	const { config } = options;
	const now = options.now ?? Date.now;

	function headers(extra: Record<string, string> = {}): Record<string, string> {
		const token = options.getCredential(SUPABASE_EVIDENCE_CREDENTIAL_ID);
		if (!token) {
			throw new Error(
				`no workspace token: put one in the vault as "${SUPABASE_EVIDENCE_CREDENTIAL_ID}" (docs/evidence-setup.md)`
			);
		}
		return {
			apikey: config.anonKey,
			authorization: `Bearer ${token}`,
			'content-type': 'application/json',
			...extra
		};
	}

	async function call(url: string, init: RequestInit): Promise<Response> {
		let response: Response;
		try {
			response = await options.fetch(url, init);
		} catch (cause) {
			// The transport's own words can quote the request, and the request carries the token.
			throw new Error('the evidence store could not be reached', { cause });
		}
		if (!response.ok) throw new Error(await errorMessage(response));
		return response;
	}

	async function pullKind(kind: EvidenceKind, query: EvidenceQuery): Promise<EvidenceItem[]> {
		const params: Record<string, string> = {
			select: 'id,digest,pushed_at,pushed_by,payload',
			workspace: `eq.${config.workspace}`,
			order: 'pushed_at.asc,id.asc'
		};
		if (query.id !== undefined) params['id'] = `eq.${query.id}`;
		if (query.since !== undefined) params['pushed_at'] = `gt.${query.since}`;
		if (query.limit !== undefined) params['limit'] = String(query.limit);
		const response = await call(restUrl(config.url, EVIDENCE_TABLES[kind], params), {
			method: 'GET',
			headers: headers()
		});
		const rows = rowSchema.array().parse(await response.json());
		return rows.map((row) =>
			evidenceItemSchema.parse({
				kind,
				id: row.id,
				digest: row.digest,
				pushedAt: new Date(row.pushed_at).toISOString(),
				...(row.pushed_by ? { pushedBy: row.pushed_by } : {}),
				payload: row.payload
			})
		);
	}

	return {
		async push(item) {
			const parsed = evidenceItemSchema.parse(item);
			const table = EVIDENCE_TABLES[parsed.kind];
			await call(restUrl(config.url, table, {}), {
				method: 'POST',
				headers: headers({ prefer: 'resolution=merge-duplicates,return=minimal' }),
				body: JSON.stringify([
					{
						workspace: config.workspace,
						id: parsed.id,
						digest: parsed.digest,
						pushed_at: parsed.pushedAt,
						pushed_by: parsed.pushedBy ?? null,
						payload: parsed.payload
					}
				])
			});
			const receipt: EvidenceReceipt = {
				storeId: SUPABASE_EVIDENCE_STORE_ID,
				workspace: config.workspace,
				kind: parsed.kind,
				id: parsed.id,
				digest: parsed.digest,
				storedAt: new Date(now()).toISOString()
			};
			return receipt;
		},
		async *pull(query) {
			const kinds = query.kind ? [query.kind] : KINDS;
			let remaining = query.limit;
			for (const kind of kinds) {
				if (remaining !== undefined && remaining <= 0) return;
				const items = await pullKind(
					kind,
					remaining === undefined ? query : { ...query, limit: remaining }
				);
				for (const item of items) yield item;
				if (remaining !== undefined) remaining -= items.length;
			}
		},
		async verify(receipt) {
			const response = await call(
				restUrl(config.url, EVIDENCE_TABLES[receipt.kind], {
					select: 'digest',
					workspace: `eq.${config.workspace}`,
					id: `eq.${receipt.id}`,
					limit: '1'
				}),
				{ method: 'GET', headers: headers() }
			);
			const rows = z.array(z.object({ digest: z.string() })).parse(await response.json());
			return rows[0]?.digest === receipt.digest;
		}
	};
}

export const supabaseEvidenceStore: EvidenceStore = {
	id: SUPABASE_EVIDENCE_STORE_ID,
	name: 'Supabase evidence store',
	description:
		'A shared table per artefact kind in a Supabase project your team provisions — a sync target for bundles, campaign reports, assurance packs and authored content, one workspace per token. Never a key, never required.',
	credential: {
		id: SUPABASE_EVIDENCE_CREDENTIAL_ID,
		name: 'Workspace token',
		kind: 'bearer-token',
		keysUrl: 'https://supabase.com/docs/guides/api/api-keys'
	},
	egress: (config): EgressDeclaration[] => {
		const parsed = supabaseEvidenceConfigSchema.safeParse(config);
		if (!parsed.success) return [];
		return [
			{
				host: hostOf(parsed.data.url),
				purpose: 'evidence sync',
				sends: ['trace', 'result', 'credential-header']
			}
		];
	},
	configSchema: supabaseEvidenceConfigSchema,
	create: ({ config, fetch, getCredential, now }) =>
		createSupabaseEvidenceInstance({
			config: supabaseEvidenceConfigSchema.parse(config),
			fetch,
			getCredential,
			...(now ? { now } : {})
		})
};
