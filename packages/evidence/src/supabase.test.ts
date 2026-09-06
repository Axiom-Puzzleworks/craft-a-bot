import { describe, expect, it } from 'vitest';
import { verifyEvidenceItem, type EvidenceItem } from '@craftabot/core';
import { checkEvidenceStore, describeEvidenceStoreConformance } from '@craftabot/pack-testkit';
import { fixtureItems } from './evidence.test.js';
import { createFakePostgrest, fakeToken } from './fake-postgrest.js';
import { EVIDENCE_TABLES, supabaseEvidenceStore } from './supabase.js';

/**
 * WP70 stage B (`58-EVIDENCE-STORE.md` §4.3, §11 items 1–3): the adapter
 * passes the network half of the conformance suite (a refused network
 * rejects, the token stays out of the message); against the fake PostgREST
 * it passes the round-trip half and every request carries the headers, the
 * filters and the upsert preference the policy relies on, with the token
 * in no URL; a token for another workspace sees nothing; and, when the
 * environment names a local Supabase (`supabase start`), the same suite
 * runs against it — skipped otherwise, as CI has no CLI.
 */
const ANON = 'sb_publishable_planted_anon_key_0123456789';
const CONFIG = { url: 'https://example-ref.supabase.co', anonKey: ANON, workspace: 'team-a' };

describeEvidenceStoreConformance(supabaseEvidenceStore, {
	config: CONFIG,
	items: await fixtureItems(),
	plantedSecret: 'planted-workspace-token-0123456789'
});

describe('evidence/supabase over a fake PostgREST', () => {
	it('round-trips every kind (the conformance suite with a network), and keeps the token out of every URL', async () => {
		const fake = createFakePostgrest({ anonKey: ANON });
		const token = fakeToken('team-a');
		const items = await fixtureItems();
		// The suite's network half over the fake: the fake is the "network", so the store must land every item.
		const withNetwork = {
			...supabaseEvidenceStore,
			create: (options: Parameters<typeof supabaseEvidenceStore.create>[0]) =>
				supabaseEvidenceStore.create({
					...options,
					fetch: fake.fetch,
					getCredential: () => token
				})
		};
		const issues = await checkEvidenceStore(withNetwork, {
			config: CONFIG,
			items,
			plantedSecret: token,
			expectsNetwork: false
		});
		expect(issues).toEqual([]);
		for (const request of fake.requests) {
			expect(request.url).not.toContain(token);
			expect(request.url).not.toContain(ANON);
			expect(request.headers['apikey']).toBe(ANON);
			expect(request.headers['authorization']).toBe(`Bearer ${token}`);
		}
		const posts = fake.requests.filter((request) => request.method === 'POST');
		expect(posts).toHaveLength(items.length);
		for (const post of posts) expect(post.headers['prefer']).toContain('merge-duplicates');
		expect([...fake.tables.keys()].sort()).toEqual(Object.values(EVIDENCE_TABLES).sort());
	});

	it('filters by id and since, pages by limit across the kinds, and verifies against the digest held', async () => {
		const fake = createFakePostgrest({ anonKey: ANON });
		const store = supabaseEvidenceStore.create({
			config: CONFIG,
			fetch: fake.fetch,
			getCredential: () => fakeToken('team-a'),
			now: () => Date.UTC(2026, 0, 5)
		});
		const items = await fixtureItems();
		for (const item of items) await store.push(item);
		const byId: EvidenceItem[] = [];
		for await (const item of store.pull({ id: 'report-1' })) byId.push(item);
		expect(byId.map((item) => item.kind)).toEqual(['campaign-report']);
		const since: EvidenceItem[] = [];
		for await (const item of store.pull({ since: '2026-01-02T00:00:00.000Z' })) since.push(item);
		expect(since).toEqual([]);
		const two: EvidenceItem[] = [];
		for await (const item of store.pull({ limit: 2 })) two.push(item);
		expect(two).toHaveLength(2);
		const gets = fake.requests.filter((request) => request.method === 'GET');
		expect(gets.some((request) => request.url.includes('id=eq.report-1'))).toBe(true);
		expect(gets.some((request) => request.url.includes('pushed_at=gt.2026-01-02'))).toBe(true);
		expect(gets.every((request) => request.url.includes('workspace=eq.team-a'))).toBe(true);
		for (const item of since.concat(byId, two)) expect(await verifyEvidenceItem(item)).toBe(true);

		const receipt = await store.push(items[0] as EvidenceItem);
		expect(receipt).toMatchObject({
			storeId: 'evidence/supabase',
			workspace: 'team-a',
			storedAt: '2026-01-05T00:00:00.000Z'
		});
		expect(await store.verify(receipt)).toBe(true);
		expect(await store.verify({ ...receipt, id: 'nowhere' })).toBe(false);
	});

	it('is scoped by the token: another workspace sees nothing and cannot write here', async () => {
		const fake = createFakePostgrest({ anonKey: ANON });
		const mine = supabaseEvidenceStore.create({
			config: CONFIG,
			fetch: fake.fetch,
			getCredential: () => fakeToken('team-a')
		});
		const theirs = supabaseEvidenceStore.create({
			config: CONFIG,
			fetch: fake.fetch,
			getCredential: () => fakeToken('team-b')
		});
		const [item] = await fixtureItems();
		const receipt = await mine.push(item as EvidenceItem);
		const seen: EvidenceItem[] = [];
		for await (const back of theirs.pull({})) seen.push(back);
		expect(seen).toEqual([]);
		expect(await theirs.verify(receipt)).toBe(false);
		await expect(theirs.push(item as EvidenceItem)).rejects.toThrow(/row-level security/);
	});

	it('reports a refusal by status and message, never by the request, and needs a token', async () => {
		const fake = createFakePostgrest({ anonKey: 'a-different-key' });
		const store = supabaseEvidenceStore.create({
			config: CONFIG,
			fetch: fake.fetch,
			getCredential: () => fakeToken('team-a')
		});
		const [item] = await fixtureItems();
		await expect(store.push(item as EvidenceItem)).rejects.toThrow(
			/answered 401: No API key found/
		);
		const noToken = supabaseEvidenceStore.create({
			config: CONFIG,
			fetch: fake.fetch,
			getCredential: () => undefined
		});
		await expect(noToken.push(item as EvidenceItem)).rejects.toThrow(/no workspace token/);
		expect(supabaseEvidenceStore.egress(CONFIG)).toEqual([
			expect.objectContaining({ host: 'example-ref.supabase.co' })
		]);
		expect(supabaseEvidenceStore.egress({})).toEqual([]);
	});
});

/**
 * The local-Supabase suite (`58-…` §4.3): `supabase start`, apply
 * `docs/evidence-setup.md`'s SQL, mint a token, then
 * `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE=… npm test -w @craftabot/evidence`.
 */
const LIVE = {
	url: process.env['SUPABASE_URL'],
	anonKey: process.env['SUPABASE_ANON_KEY'],
	token: process.env['CRAFTABOT_CREDENTIAL_EVIDENCE_SUPABASE']
};
describe.skipIf(!LIVE.url || !LIVE.anonKey || !LIVE.token)(
	'evidence/supabase against a real project',
	() => {
		it('round-trips every kind', async () => {
			const workspace = process.env['SUPABASE_WORKSPACE'] ?? 'conformance';
			const config = { url: LIVE.url as string, anonKey: LIVE.anonKey as string, workspace };
			const live = {
				...supabaseEvidenceStore,
				create: (options: Parameters<typeof supabaseEvidenceStore.create>[0]) =>
					supabaseEvidenceStore.create({
						...options,
						fetch: globalThis.fetch,
						getCredential: () => LIVE.token as string
					})
			};
			const issues = await checkEvidenceStore(live, {
				config,
				items: await fixtureItems(),
				plantedSecret: LIVE.token as string,
				expectsNetwork: false
			});
			expect(issues).toEqual([]);
		});
	}
);
