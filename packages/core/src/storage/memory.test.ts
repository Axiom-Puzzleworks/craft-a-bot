import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from './memory.js';
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
