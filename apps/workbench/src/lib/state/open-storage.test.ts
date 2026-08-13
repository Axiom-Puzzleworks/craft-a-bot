import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openStorage } from './open-storage.js';

describe('openStorage', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('uses IndexedDB when the browser has it', async () => {
		const { storage, fallbackReason } = await openStorage('craftabot-open-test');
		expect(storage.kind).toBe('indexeddb');
		expect(fallbackReason).toBeUndefined();
	});

	it('falls back to memory when IndexedDB is missing, and says why (07 §8)', async () => {
		vi.stubGlobal('indexedDB', undefined);
		const { storage, fallbackReason } = await openStorage();

		expect(storage.kind).toBe('memory');
		expect(fallbackReason).toContain('no IndexedDB');
	});

	it('falls back to memory when IndexedDB refuses to open', async () => {
		vi.stubGlobal('indexedDB', {
			open: () => {
				throw new Error('blocked by policy');
			}
		});
		const { storage, fallbackReason } = await openStorage();

		expect(storage.kind).toBe('memory');
		expect(fallbackReason).toContain('blocked by policy');
	});

	it('still returns a usable store after falling back', async () => {
		vi.stubGlobal('indexedDB', undefined);
		const { storage } = await openStorage();
		await storage.putRun({
			id: '22222222-2222-4222-8222-222222222222',
			agentId: '11111111-1111-4111-8111-111111111111',
			agentName: 'Snackbot',
			goalCardId: 'starter/say-hello',
			specSnapshot: {
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Snackbot',
				bricks: {},
				goalCardId: 'starter/say-hello',
				createdAt: '2026-08-12T09:00:00Z',
				updatedAt: '2026-08-12T09:00:00Z',
				schemaVersion: 1
			},
			packVersions: {},
			mode: 'step',
			outcome: 'SUCCESS',
			ticks: 1,
			usage: { inputTokens: 1, outputTokens: 1 },
			budgets: { maxTicks: 30, maxTokens: 100000, requestTimeoutMs: 60000 },
			providerId: 'mock',
			wireModel: 'mock-1',
			pinned: false,
			startedAt: '2026-08-12T10:00:00Z',
			schemaVersion: 2
		});
		expect(await storage.listRuns()).toHaveLength(1);
	});
});
