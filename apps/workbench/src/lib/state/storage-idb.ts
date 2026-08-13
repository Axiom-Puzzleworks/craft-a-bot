import {
	migrateAgentRecord,
	safeParseAgentRecord,
	safeParseStoredEvent,
	type AgentRecord,
	type EngineEvent,
	type RunRecord,
	type StoredEvent
} from '@craftabot/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
	DEFAULT_RUN_CAP,
	byNewestFirst,
	emptyQuarantine,
	selectRunsToEvict,
	type QuarantineReport,
	type Storage
} from './storage.js';

/**
 * The IndexedDB store (07-DATA-MODEL-PERSISTENCE.md §2): one `craftabot`
 * database, three object stores, versioned migrations from day one.
 *
 * Reads are validated and bad rows are quarantined rather than thrown — a
 * single corrupt record from an older build must not take the shelf down
 * (07 §1.5).
 */

export const DATABASE_NAME = 'craftabot';
export const DATABASE_VERSION = 1;

interface CraftABotDB extends DBSchema {
	agents: { key: string; value: AgentRecord };
	runs: { key: string; value: RunRecord; indexes: { startedAt: string } };
	events: { key: [string, number]; value: StoredEvent; indexes: { runId: string } };
}

export interface IdbStorage extends Storage {
	readonly kind: 'indexeddb';
	quarantined(): QuarantineReport;
	close(): void;
}

/**
 * Migrations are a switch on `oldVersion` from the very first release, so the
 * pattern exists before it is needed (07 §2). Adding v2 means adding a case,
 * never rewriting this function.
 */
function upgrade(db: IDBPDatabase<CraftABotDB>, oldVersion: number): void {
	if (oldVersion < 1) {
		db.createObjectStore('agents', { keyPath: 'id' });
		const runs = db.createObjectStore('runs', { keyPath: 'id' });
		runs.createIndex('startedAt', 'startedAt');
		const events = db.createObjectStore('events', { keyPath: ['runId', 'seq'] });
		events.createIndex('runId', 'runId');
	}
}

export async function createIdbStorage(name = DATABASE_NAME): Promise<IdbStorage> {
	const quarantine = emptyQuarantine();
	const db = await openDB<CraftABotDB>(name, DATABASE_VERSION, { upgrade });

	async function readRuns(): Promise<RunRecord[]> {
		// RunRecord has no user-authored fields, so a shape check is enough here;
		// the schema-level guard that matters is on agents and events.
		return (await db.getAll('runs')).sort(byNewestFirst);
	}

	return {
		kind: 'indexeddb',
		quarantined: () => ({ ...quarantine }),
		close: () => db.close(),

		async listAgents() {
			const rows = await db.getAll('agents');
			const valid: AgentRecord[] = [];
			for (const row of rows) {
				const migrated = migrateAgentRecord(row);
				if ('kind' in migrated) quarantine.agents += 1;
				else valid.push(migrated);
			}
			return valid;
		},
		async getAgent(id) {
			const row = await db.get('agents', id);
			if (row === undefined) return undefined;
			const migrated = migrateAgentRecord(row);
			if (!('kind' in migrated)) return migrated;
			quarantine.agents += 1;
			return undefined;
		},
		async putAgent(record) {
			const parsed = safeParseAgentRecord(record);
			if (!parsed.success) {
				quarantine.agents += 1;
				throw new Error(`Refusing to store an invalid agent: ${parsed.error.message}`);
			}
			await db.put('agents', record);
		},
		async deleteAgent(id) {
			await db.delete('agents', id);
		},

		listRuns: readRuns,
		getRun: (id) => db.get('runs', id),
		async putRun(record) {
			await db.put('runs', record);
		},
		async deleteRun(id) {
			await db.delete('runs', id);
			await deleteEventsFor(db, id);
		},
		async setRunPinned(id, pinned) {
			const run = await db.get('runs', id);
			if (run) await db.put('runs', { ...run, pinned });
		},

		async appendEvents(runId: string, incoming: readonly EngineEvent[]) {
			const existing = await db.getAllFromIndex('events', 'runId', runId);
			let seq = existing.length;
			const tx = db.transaction('events', 'readwrite');
			for (const event of incoming) {
				const stored: StoredEvent = { runId, seq, event };
				if (!safeParseStoredEvent(stored).success) {
					quarantine.events += 1;
					continue;
				}
				await tx.store.put(stored);
				seq += 1;
			}
			await tx.done;
		},
		async getEvents(runId) {
			const rows = await db.getAllFromIndex('events', 'runId', runId);
			const valid: StoredEvent[] = [];
			for (const row of rows) {
				const parsed = safeParseStoredEvent(row);
				if (parsed.success) valid.push(parsed.data);
				else quarantine.events += 1;
			}
			return valid.sort((a, b) => a.seq - b.seq);
		},
		deleteEvents: (runId) => deleteEventsFor(db, runId),

		async evictOldRuns(cap = DEFAULT_RUN_CAP) {
			const doomed = selectRunsToEvict(await readRuns(), cap);
			for (const id of doomed) {
				await db.delete('runs', id);
				await deleteEventsFor(db, id);
			}
			return doomed;
		},

		async clear() {
			await db.clear('agents');
			await db.clear('runs');
			await db.clear('events');
		}
	};
}

async function deleteEventsFor(db: IDBPDatabase<CraftABotDB>, runId: string): Promise<void> {
	const keys = await db.getAllKeysFromIndex('events', 'runId', runId);
	const tx = db.transaction('events', 'readwrite');
	for (const key of keys) await tx.store.delete(key);
	await tx.done;
}
