import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './memory.js';
import type { StoredWorkflowRun } from '../schemas/workflow-run.js';
import { describeStorageContract } from '../testing/storage-contract.js';

describeStorageContract('memory', () => Promise.resolve(createMemoryStorage()));

describe('the in-memory store specifically', () => {
	it('identifies itself, so the shelf can warn that nothing will be saved', () => {
		expect(createMemoryStorage().kind).toBe('memory');
	});

	it('counts quarantined events rather than throwing on them', async () => {
		const storage = createMemoryStorage();
		// A shape the event schema will reject.
		const broken = { id: 'nope', runId: 'nope', tick: -1, timestamp: 'never', type: 'x' };
		await storage.appendEvents('00000000-0000-4000-8000-000000000100', [broken as never]);

		expect(storage.quarantined().events).toBe(1);
		expect(await storage.getEvents('00000000-0000-4000-8000-000000000100')).toEqual([]);
	});
});

/** Workflow runs (WP86, `77-PIPELINE-AND-BOUNDARY.md` §3): stored by the run's id, listed newest first, refused when malformed, gone on clear. */
describe('memory storage: workflow runs', () => {
	const stored = (id: string, startedAt: string): StoredWorkflowRun => ({
		run: {
			schemaVersion: 1,
			id,
			workflowId: 'test/visit',
			itemId: `item-${id}`,
			config: {},
			startedAt,
			finishedAt: startedAt,
			outcome: 'completed',
			stages: [],
			runIds: [],
			events: [],
			digest: 'd'
		},
		source: { kind: 'import' },
		createdAt: '2026-09-11T09:00:00.000Z',
		schemaVersion: 1
	});

	it('puts, gets, lists newest first, deletes, and refuses a malformed row', async () => {
		const storage = createMemoryStorage();
		await storage.putWorkflowRun(stored('a', '2026-01-05T09:00:00.000Z'));
		await storage.putWorkflowRun(stored('b', '2026-01-06T09:00:00.000Z'));
		expect((await storage.listWorkflowRuns()).map((row) => row.run.id)).toEqual(['b', 'a']);
		expect((await storage.getWorkflowRun('a'))?.run.itemId).toBe('item-a');
		await expect(
			storage.putWorkflowRun({
				...stored('c', '2026-01-07T09:00:00.000Z'),
				schemaVersion: 2
			} as never)
		).rejects.toThrow('invalid workflow run');
		await storage.deleteWorkflowRun('a');
		expect((await storage.listWorkflowRuns()).map((row) => row.run.id)).toEqual(['b']);
		await storage.clear();
		expect(await storage.listWorkflowRuns()).toEqual([]);
	});

	it('orders two runs that started together by the store’s own clock', async () => {
		const storage = createMemoryStorage();
		await storage.putWorkflowRun({
			...stored('x', '2026-01-05T09:00:00.000Z'),
			createdAt: '2026-09-11T09:00:00.000Z'
		});
		await storage.putWorkflowRun({
			...stored('y', '2026-01-05T09:00:00.000Z'),
			createdAt: '2026-09-11T10:00:00.000Z'
		});
		expect((await storage.listWorkflowRuns()).map((row) => row.run.id)).toEqual(['y', 'x']);
	});
});
