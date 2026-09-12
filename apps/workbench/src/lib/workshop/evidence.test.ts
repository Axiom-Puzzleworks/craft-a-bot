import { describe, expect, it } from 'vitest';
import { createMemoryStorage, type ContentRecord, type EvidenceItem } from '@craftabot/core';
import { makeEvent, makeExperimentResult, makeRun } from '@craftabot/core/testing';
import {
	importPulled,
	itemForContent,
	itemForExperimentResult,
	itemForReport,
	itemForRun,
	verifyPulled
} from './evidence.js';

/**
 * The Workshop's half of the evidence store (WP70, `58-…` §4.5): an item
 * built from the local store round-trips through `importPulled`; a
 * tampered bundle — the item's digest intact but the bundle's own broken —
 * is refused; a content record goes through the caller's content store.
 */
describe('evidence items in the Workshop', () => {
	it('builds a run as its bundle and imports it back as the run, its events and its evaluations', async () => {
		const storage = createMemoryStorage();
		const run = makeRun();
		const events = [makeEvent(run.id, 0, 1), makeEvent(run.id, 1, 2)];
		await storage.putRun(run);
		await storage.appendEvents(run.id, events);
		const item = await itemForRun(storage, run, ['planted-secret'], {
			principal: 'p-1',
			now: () => Date.UTC(2026, 0, 1)
		});
		expect(item.kind).toBe('bundle');
		expect(item.id).toBe(run.id);
		expect(item.pushedBy).toBe('p-1');
		expect(await verifyPulled(item)).toBe(true);

		const other = createMemoryStorage();
		const imported = await importPulled(other, item, { saveContent: async () => undefined });
		expect(imported).toEqual({ kind: 'bundle', runIds: [run.id] });
		expect((await other.getRun(run.id))?.agentName).toBe(run.agentName);
		expect(await other.getEvents(run.id)).toHaveLength(2);
	});

	it('refuses a bundle whose own digest is broken even when the item digest is intact, and a tampered payload', async () => {
		const storage = createMemoryStorage();
		const run = makeRun();
		await storage.putRun(run);
		await storage.appendEvents(run.id, [makeEvent(run.id, 0, 1)]);
		const item = (await itemForRun(storage, run, [])) as Extract<EvidenceItem, { kind: 'bundle' }>;
		const tampered = structuredClone(item);
		tampered.payload.bundleDigest = 'f'.repeat(64);
		expect(await verifyPulled(tampered)).toBe(false);
		await expect(
			importPulled(createMemoryStorage(), tampered, { saveContent: async () => undefined })
		).rejects.toThrow(/refused/);
		const payloadChanged = structuredClone(item);
		payloadChanged.payload.exportedBy = 'someone else';
		expect(await verifyPulled(payloadChanged)).toBe(false);
	});

	it('imports a report into the campaign reports and content through the content store', async () => {
		const storage = createMemoryStorage();
		const report = await itemForReport({
			id: 'report-1',
			campaignId: 'c',
			title: 'A report',
			createdAt: '2026-01-01T00:00:00.000Z',
			passed: true,
			gatesPassed: 1,
			gatesTotal: 1,
			cells: 1,
			report: {},
			schemaVersion: 1
		});
		expect(await importPulled(storage, report, { saveContent: async () => undefined })).toEqual({
			kind: 'campaign-report',
			id: 'report-1'
		});
		expect((await storage.getCampaignReport('report-1'))?.title).toBe('A report');

		const saved: ContentRecord[] = [];
		const content = await itemForContent({
			id: 'local/campaigns/mine',
			kind: 'campaign',
			title: 'Mine',
			record: { id: 'local/campaigns/mine' },
			savedAt: '2026-01-01T00:00:00.000Z',
			schemaVersion: 1
		});
		await importPulled(storage, content, {
			saveContent: async (record) => void saved.push(record)
		});
		expect(saved.map((record) => record.id)).toEqual(['local/campaigns/mine']);
	});

	it('imports an experiment result into the experiment-results store (WP89)', async () => {
		const storage = createMemoryStorage();
		const result = makeExperimentResult();
		const item = await itemForExperimentResult(result);
		expect(item.kind).toBe('experiment-result');
		expect(await verifyPulled(item)).toBe(true);
		expect(await importPulled(storage, item, { saveContent: async () => undefined })).toEqual({
			kind: 'experiment-result',
			id: result.id
		});
		expect((await storage.getExperimentResult(result.id))?.verdict).toBe('inconclusive');
	});
});
