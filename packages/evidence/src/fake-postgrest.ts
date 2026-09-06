/**
 * **A fake PostgREST** for the Supabase adapter's tests (`58-…` §4.3): the
 * three request shapes the adapter relies on — an upsert `POST` with
 * `resolution=merge-duplicates`, a filtered `GET` with `eq.`/`gt.` filters,
 * `order` and `limit`, and the `apikey`/`authorization` headers — answered
 * from a map, with the rows scoped to the token's workspace exactly as the
 * row-level-security policy in `docs/evidence-setup.md` scopes them. A
 * request without the headers is refused as PostgREST refuses it, with a
 * `message` in the body. Test scaffolding; excluded from the build.
 */

export interface FakeRow {
	workspace: string;
	id: string;
	digest: string;
	pushed_at: string;
	pushed_by: string | null;
	payload: unknown;
}

export interface FakePostgrest {
	fetch: typeof globalThis.fetch;
	tables: Map<string, FakeRow[]>;
	requests: Array<{ method: string; url: string; headers: Record<string, string> }>;
}

/** Each token names its workspace: `token-for-<workspace>`. */
export function fakeToken(workspace: string): string {
	return `token-for-${workspace}`;
}

export function createFakePostgrest(options: { anonKey: string }): FakePostgrest {
	const tables = new Map<string, FakeRow[]>();
	const requests: FakePostgrest['requests'] = [];
	const json = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});

	const fetch: typeof globalThis.fetch = async (input, init) => {
		const url = new URL(typeof input === 'string' ? input : (input as Request).url);
		const headers = Object.fromEntries(
			Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [
				k.toLowerCase(),
				v
			])
		);
		const method = init?.method ?? 'GET';
		requests.push({ method, url: url.toString(), headers });
		if (headers['apikey'] !== options.anonKey) {
			return json(401, { message: 'No API key found in request' });
		}
		const bearer = headers['authorization']?.replace(/^Bearer /, '') ?? '';
		if (!bearer.startsWith('token-for-')) return json(401, { message: 'invalid JWT' });
		const workspace = bearer.slice('token-for-'.length);
		const match = /^\/rest\/v1\/([a-z_]+)$/.exec(url.pathname);
		if (!match) return json(404, { message: 'not found' });
		const table = match[1] as string;
		const rows = tables.get(table) ?? [];
		tables.set(table, rows);

		if (method === 'POST') {
			const body = JSON.parse(await new Response(init?.body as BodyInit).text()) as FakeRow[];
			for (const row of body) {
				// RLS: a row for another workspace is refused, not silently dropped.
				if (row.workspace !== workspace) {
					return json(401, { message: 'new row violates row-level security policy' });
				}
				const at = rows.findIndex((r) => r.workspace === row.workspace && r.id === row.id);
				if (at >= 0 && headers['prefer']?.includes('merge-duplicates')) rows[at] = row;
				else if (at >= 0) return json(409, { message: 'duplicate key value' });
				else rows.push(row);
			}
			return json(201, []);
		}
		if (method === 'GET') {
			let out = rows.filter((row) => row.workspace === workspace);
			for (const [key, value] of url.searchParams) {
				if (['select', 'order', 'limit'].includes(key)) continue;
				const [op, ...rest] = value.split('.');
				const operand = rest.join('.');
				out = out.filter((row) => {
					const held = String((row as unknown as Record<string, unknown>)[key]);
					if (op === 'eq') return held === operand;
					if (op === 'gt') return held > operand;
					return false;
				});
			}
			out = [...out].sort(
				(a, b) => a.pushed_at.localeCompare(b.pushed_at) || a.id.localeCompare(b.id)
			);
			const limit = url.searchParams.get('limit');
			if (limit) out = out.slice(0, Number(limit));
			const select = url.searchParams.get('select')?.split(',') ?? [];
			return json(
				200,
				out.map((row) =>
					Object.fromEntries(
						select.map((field) => [field, (row as unknown as Record<string, unknown>)[field]])
					)
				)
			);
		}
		return json(405, { message: 'method not allowed' });
	};
	return { fetch, tables, requests };
}
