import { describe, expect, it } from 'vitest';
import {
	buildTraceBundle,
	computeEvidenceDigest,
	createPackRegistry,
	evidenceIdFor,
	evidenceItemFor,
	verifyEvidenceItem,
	type EvidenceItem,
	type PackManifest
} from '@craftabot/core';
import { makeEvent, makeRun } from '@craftabot/core/testing';
import { describeEvidenceStoreConformance } from '@craftabot/pack-testkit';
import { evidencePack, memoryEvidenceStore, resetMemoryEvidence } from './index.js';

/**
 * WP70 stage A (`58-EVIDENCE-STORE.md` §4.1–4.2, §11 items 1–2): the memory
 * store passes the conformance suite; an item of every kind round-trips; a
 * tampered payload does not verify; the ids follow §4.1; the registry lists
 * the store from the manifest and refuses a malformed one.
 */
const PACK = { bot: { id: 'agent-1' }, generatedAt: '2026-01-01T00:00:00.000Z', digest: 'x' };

export async function fixtureItems(): Promise<EvidenceItem[]> {
	const run = makeRun();
	const events = [makeEvent(run.id, 0, 1), makeEvent(run.id, 1, 2)];
	const bundle = await buildTraceBundle({
		runs: [{ run, events }],
		exportedBy: 'test',
		exportedAt: '2026-01-01T00:00:00.000Z'
	});
	const now = () => Date.UTC(2026, 0, 2);
	return [
		await evidenceItemFor('bundle', evidenceIdFor('bundle', bundle), bundle, { now }),
		await evidenceItemFor(
			'campaign-report',
			'report-1',
			{
				id: 'report-1',
				campaignId: 'campaign-1',
				title: 'A report',
				createdAt: '2026-01-01T00:00:00.000Z',
				passed: true,
				gatesPassed: 1,
				gatesTotal: 1,
				cells: 2,
				report: { anything: true },
				schemaVersion: 1
			},
			{ now, principal: 'tester' }
		),
		await evidenceItemFor('assurance-pack', evidenceIdFor('assurance-pack', PACK), PACK, { now }),
		await evidenceItemFor(
			'content',
			'local/campaigns/my-campaign',
			{
				id: 'local/campaigns/my-campaign',
				kind: 'campaign',
				title: 'My campaign',
				record: { id: 'local/campaigns/my-campaign' },
				savedAt: '2026-01-01T00:00:00.000Z',
				schemaVersion: 1
			},
			{ now }
		)
	];
}

describe('evidence items', () => {
	it('digests by one rule, key order aside, and a tampered payload does not verify', async () => {
		const a = await computeEvidenceDigest({ b: 1, a: [{ d: 2, c: 3 }] });
		const b = await computeEvidenceDigest({ a: [{ c: 3, d: 2 }], b: 1 });
		expect(a).toBe(b);
		const [bundle] = await fixtureItems();
		expect(await verifyEvidenceItem(bundle as EvidenceItem)).toBe(true);
		const tampered = structuredClone(bundle) as Extract<EvidenceItem, { kind: 'bundle' }>;
		tampered.payload.exportedBy = 'someone else';
		expect(await verifyEvidenceItem(tampered)).toBe(false);
	});

	it('takes its id from the artefact (§4.1)', async () => {
		const [bundle, report, pack, content] = await fixtureItems();
		expect(bundle?.id).toBe(makeRun().id);
		expect(report?.id).toBe('report-1');
		expect(pack?.id).toBe('assurance/agent-1/2026-01-01T00:00:00.000Z');
		expect(content?.id).toBe('local/campaigns/my-campaign');
		expect(report?.pushedBy).toBe('tester');
		expect(() => evidenceIdFor('bundle', { runs: [] })).toThrow(/no run/);
		expect(() => evidenceIdFor('content', {})).toThrow(/has an id/);
		expect(() => evidenceIdFor('assurance-pack', {})).toThrow(/names its bot/);
	});

	it('is a closed union: a run that is not a bundle is not an item', async () => {
		const run = makeRun();
		await expect(evidenceItemFor('bundle', 'x', { run, events: [] } as never)).rejects.toThrow();
	});
});

describe('the memory store', async () => {
	resetMemoryEvidence();
	describeEvidenceStoreConformance(memoryEvidenceStore, {
		config: { workspace: 'conformance' },
		items: await fixtureItems(),
		plantedSecret: 'planted-workspace-token',
		expectsNetwork: false
	});

	it('shares rows per workspace, honours since and limit, and replaces on the same id', async () => {
		resetMemoryEvidence();
		const items = await fixtureItems();
		const build = (workspace: string) =>
			memoryEvidenceStore.create({
				config: { workspace },
				fetch: globalThis.fetch,
				getCredential: () => undefined,
				now: () => Date.UTC(2026, 0, 3)
			});
		const a = build('w');
		const b = build('w');
		for (const item of items) await a.push(item);
		const seen: string[] = [];
		for await (const item of b.pull({ limit: 2 })) seen.push(item.id);
		expect(seen).toHaveLength(2);
		const later: string[] = [];
		for await (const item of b.pull({ since: '2026-01-03T00:00:00.000Z' })) later.push(item.id);
		expect(later).toEqual([]);
		const replaced = { ...(items[1] as EvidenceItem), pushedAt: '2026-02-01T00:00:00.000Z' };
		const receipt = await a.push(replaced);
		expect(receipt).toMatchObject({
			storeId: 'evidence/memory',
			workspace: 'w',
			kind: 'campaign-report',
			id: 'report-1',
			digest: items[1]?.digest,
			storedAt: '2026-01-03T00:00:00.000Z'
		});
		const after: string[] = [];
		for await (const item of b.pull({ since: '2026-01-03T00:00:00.000Z' })) after.push(item.id);
		expect(after).toEqual(['report-1']);
		expect(await build('other').verify(receipt)).toBe(false);
	});
});

describe('the manifest', () => {
	it('registers the store as content, and refuses a store with no egress', () => {
		const registry = createPackRegistry();
		registry.registerPack(evidencePack);
		expect(registry.listEvidenceStores().map((store) => store.id)).toEqual([
			'evidence/supabase',
			'evidence/memory'
		]);
		expect(registry.getEvidenceStore('evidence/memory')?.name).toBe(memoryEvidenceStore.name);
		const broken: PackManifest = {
			...evidencePack,
			id: 'broken',
			evidenceStores: [
				{ ...memoryEvidenceStore, id: 'evidence/broken', egress: undefined as never }
			]
		};
		expect(() => createPackRegistry().registerPack(broken)).toThrow(/declares no egress/);
	});
});
