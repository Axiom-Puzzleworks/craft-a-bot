import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { DATABASE_VERSION, createIdbStorage } from './storage-idb.js';
import { describeStorageContract } from './storage-contract.js';
import {
	makeAgent,
	makeAgentV1,
	makeCampaignReport,
	makeEvaluation,
	makeGroupRun,
	makeRun,
	makeRunSummary
} from './storage-fixtures.js';

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

	it('ships at schema version 5, with the migration switch already in place', () => {
		expect(DATABASE_VERSION).toBe(5);
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

	/**
	 * The upgrade path (WP14): everyone who used V1.0 has a database full of v1
	 * rows. Reading is where they come forward — a straight parse would
	 * quarantine every one and the user would open the app to an empty shelf.
	 */
	it('brings a shelf written by V1.0 forward, rather than quarantining it', async () => {
		const name = 'craftabot-v1-shelf';
		const storage = await createIdbStorage(name);
		opened.push(storage);

		const raw = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, DATABASE_VERSION);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = raw.transaction('agents', 'readwrite');
			tx.objectStore('agents').put(makeAgentV1());
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		raw.close();

		const agents = await storage.listAgents();
		expect(storage.quarantined().agents).toBe(0);
		expect(agents).toHaveLength(1);
		expect(agents[0]?.schemaVersion).toBe(2);
		expect(agents[0]?.spec.schemaVersion).toBe(2);
		// The seed was on the row and is now on the bot, so the box art a person
		// has been looking at for a year is the box art they keep.
		expect(agents[0]?.spec.identity.boxArtSeed).toBe('seed-1');

		// And the same row fetched by id, which is a different code path.
		const one = await storage.getAgent(agents[0]?.id ?? '');
		expect(one?.spec.identity.boxArtSeed).toBe('seed-1');
	});

	/**
	 * WP29 (`23-…` §4.7, §10 stage F): the version-1 database — everyone who
	 * has ever opened the app before this change — gets `groupRuns` added on
	 * top of what it already had, not rebuilt. `upgrade()`'s own `oldVersion`
	 * switch is what makes this "adding a case", per its comment; this is the
	 * test that the case actually fires against a database that predates it.
	 */
	it('adds the group-runs store to a database that predates it, leaving what was already there', async () => {
		const name = 'craftabot-v1-database';
		const v1 = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				db.createObjectStore('agents', { keyPath: 'id' });
				const runs = db.createObjectStore('runs', { keyPath: 'id' });
				runs.createIndex('startedAt', 'startedAt');
				const events = db.createObjectStore('events', { keyPath: ['runId', 'seq'] });
				events.createIndex('runId', 'runId');
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = v1.transaction('agents', 'readwrite');
			tx.objectStore('agents').put(makeAgent());
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		v1.close();

		const storage = await createIdbStorage(name);
		opened.push(storage);

		expect(await storage.listAgents()).toHaveLength(1);
		expect(await storage.listGroupRuns()).toEqual([]);

		const groupRun = makeGroupRun();
		await storage.putGroupRun(groupRun);
		expect(await storage.getGroupRun(groupRun.id)).toEqual(groupRun);
	});

	/**
	 * WP36 stage C: a version-2 database — everyone who played between WP29
	 * and this change — gets `runSummaries` added on top of what it already
	 * had. Its runs have no summary row yet, which is exactly what
	 * `ensureRunSummaries` folds on first read; nothing is migrated.
	 */
	it('adds the run-summaries store to a version-2 database, leaving what was already there', async () => {
		const name = 'craftabot-v2-database';
		const v2 = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, 2);
			request.onupgradeneeded = () => {
				const db = request.result;
				db.createObjectStore('agents', { keyPath: 'id' });
				const runs = db.createObjectStore('runs', { keyPath: 'id' });
				runs.createIndex('startedAt', 'startedAt');
				const events = db.createObjectStore('events', { keyPath: ['runId', 'seq'] });
				events.createIndex('runId', 'runId');
				const groupRuns = db.createObjectStore('groupRuns', { keyPath: 'id' });
				groupRuns.createIndex('startedAt', 'startedAt');
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = v2.transaction('runs', 'readwrite');
			tx.objectStore('runs').put(makeRun());
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		v2.close();

		const storage = await createIdbStorage(name);
		opened.push(storage);

		expect(await storage.listRuns()).toHaveLength(1);
		expect(await storage.getRunSummary(makeRun().id)).toBeUndefined();

		const summary = makeRunSummary();
		await storage.putRunSummary(summary);
		expect(await storage.getRunSummary(summary.runId)).toEqual(summary);
	});

	/** WP38 stage D: a version-3 database gets `campaigns` added, and keeps everything it had. */
	it('adds the campaigns store to a version-3 database, leaving what was already there', async () => {
		const name = 'craftabot-v3-database';
		const v3 = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, 3);
			request.onupgradeneeded = () => {
				const db = request.result;
				db.createObjectStore('agents', { keyPath: 'id' });
				const runs = db.createObjectStore('runs', { keyPath: 'id' });
				runs.createIndex('startedAt', 'startedAt');
				const events = db.createObjectStore('events', { keyPath: ['runId', 'seq'] });
				events.createIndex('runId', 'runId');
				const groupRuns = db.createObjectStore('groupRuns', { keyPath: 'id' });
				groupRuns.createIndex('startedAt', 'startedAt');
				db.createObjectStore('runSummaries', { keyPath: 'runId' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = v3.transaction('runSummaries', 'readwrite');
			tx.objectStore('runSummaries').put(makeRunSummary());
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		v3.close();

		const storage = await createIdbStorage(name);
		opened.push(storage);

		expect(await storage.listRunSummaries()).toHaveLength(1);
		expect(await storage.listCampaignReports()).toEqual([]);
		const report = makeCampaignReport();
		await storage.putCampaignReport(report);
		expect(await storage.getCampaignReport(report.id)).toEqual(report);
	});

	/** WP43: a version-4 database gets `evaluations` added, and keeps everything it had. */
	it('adds the evaluations store to a version-4 database, leaving what was already there', async () => {
		const name = 'craftabot-v4-database';
		const v4 = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(name, 4);
			request.onupgradeneeded = () => {
				const db = request.result;
				db.createObjectStore('agents', { keyPath: 'id' });
				const runs = db.createObjectStore('runs', { keyPath: 'id' });
				runs.createIndex('startedAt', 'startedAt');
				const events = db.createObjectStore('events', { keyPath: ['runId', 'seq'] });
				events.createIndex('runId', 'runId');
				const groupRuns = db.createObjectStore('groupRuns', { keyPath: 'id' });
				groupRuns.createIndex('startedAt', 'startedAt');
				db.createObjectStore('runSummaries', { keyPath: 'runId' });
				db.createObjectStore('campaigns', { keyPath: 'id' });
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		await new Promise<void>((resolve, reject) => {
			const tx = v4.transaction('campaigns', 'readwrite');
			tx.objectStore('campaigns').put(makeCampaignReport());
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
		v4.close();

		const storage = await createIdbStorage(name);
		opened.push(storage);

		expect(await storage.listCampaignReports()).toHaveLength(1);
		expect(await storage.listAllEvaluations()).toEqual([]);
		const record = makeEvaluation();
		await storage.putEvaluation(record);
		expect(await storage.listEvaluations(record.runId)).toEqual([record]);
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
