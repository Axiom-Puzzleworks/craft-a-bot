import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_VERSION, createIdbStorage } from './storage-idb.js';
import { describeStorageContract } from './storage-contract.js';
import { makeAgent } from './storage-fixtures.js';

/**
 * The same contract as the in-memory store, plus the things only a real
 * database can get wrong. `fake-indexeddb/auto` installs a working IndexedDB
 * into jsdom, which has none of its own.
 */

let databaseCount = 0;
const open = async () => {
	// A fresh database per test keeps them independent without teardown ceremony.
	databaseCount += 1;
	return createIdbStorage(`craftabot-test-${databaseCount}`);
};

describeStorageContract('indexeddb', open);

describe('the IndexedDB store specifically', () => {
	const opened: Array<{ close(): void }> = [];

	afterEach(() => {
		for (const storage of opened) storage.close();
		opened.length = 0;
	});

	it('identifies itself as the durable store', async () => {
		const storage = await open();
		opened.push(storage);
		expect(storage.kind).toBe('indexeddb');
	});

	it('ships at schema version 1, with the migration switch already in place', () => {
		expect(DATABASE_VERSION).toBe(1);
	});

	it('survives being closed and reopened — the whole point of persisting', async () => {
		const name = 'craftabot-persistence-check';
		const first = await createIdbStorage(name);
		const agent = makeAgent();
		await first.putAgent(agent);
		first.close();

		const second = await createIdbStorage(name);
		opened.push(second);
		expect(await second.getAgent(agent.id)).toEqual(agent);
	});

	it('quarantines a corrupt row instead of taking the shelf down', async () => {
		const name = 'craftabot-corrupt-check';
		const storage = await createIdbStorage(name);
		opened.push(storage);
		await storage.putAgent(makeAgent());

		// Write a bad row behind the store's back, as an older build might have.
		const raw = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = raw.transaction('agents', 'readwrite');
			tx.objectStore('agents').put({ id: 'not-a-uuid', rubbish: true });
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		raw.close();

		// The good record still comes back; the bad one is counted, not thrown.
		expect(await storage.listAgents()).toHaveLength(1);
		expect(storage.quarantined().agents).toBe(1);

		// Fetching the corrupt row by id yields nothing rather than a broken object.
		expect(await storage.getAgent('not-a-uuid')).toBeUndefined();
		expect(storage.quarantined().agents).toBe(2);
	});

	it('refuses to store an invalid agent', async () => {
		const storage = await open();
		opened.push(storage);
		await expect(storage.putAgent({ ...makeAgent(), id: 'nope' })).rejects.toThrow();
		expect(storage.quarantined().agents).toBe(1);
	});

	it('quarantines an unrecognisable event rather than storing it', async () => {
		const storage = await open();
		opened.push(storage);
		const runId = '00000000-0000-4000-8000-000000000100';
		await storage.appendEvents(runId, [{ type: 'invented.event' } as never]);

		expect(await storage.getEvents(runId)).toEqual([]);
		expect(storage.quarantined().events).toBe(1);
	});
});
