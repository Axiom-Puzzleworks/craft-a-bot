import {
	migrateAgentRecord,
	safeParseAgentRecord,
	safeParseRunSummary,
	safeParseContentRecord,
	safeParseEvaluationRecord,
	safeParseStoredCampaignReport,
	safeParseStoredEvent,
	type AgentRecord,
	type EngineEvent,
	type GroupRunRecord,
	type RunRecord,
	type RunSummary,
	type ContentRecord,
	type EvaluationRecord,
	type StoredCampaignReport,
	type StoredEvent
} from '@craftabot/core';
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
	DEFAULT_RUN_CAP,
	byNewestCreated,
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
export const DATABASE_VERSION = 6;

interface CraftABotDB extends DBSchema {
	agents: { key: string; value: AgentRecord };
	runs: { key: string; value: RunRecord; indexes: { startedAt: string } };
	events: { key: [string, number]; value: StoredEvent; indexes: { runId: string } };
	groupRuns: { key: string; value: GroupRunRecord; indexes: { startedAt: string } };
	runSummaries: { key: string; value: RunSummary };
	campaigns: { key: string; value: StoredCampaignReport };
	evaluations: { key: string; value: EvaluationRecord; indexes: { runId: string } };
	content: { key: string; value: ContentRecord; indexes: { kind: string } };
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
	// A group episode's own row (WP29, `23-…` §4.7, §10 stage F) — a new store,
	// not a new shape on `runs`: a `GroupRunRecord` has no `specSnapshot`, no
	// single `providerId`, and mixing the two shapes in one store would have
	// made every reader guess which kind of row it had.
	if (oldVersion < 2) {
		const groupRuns = db.createObjectStore('groupRuns', { keyPath: 'id' });
		groupRuns.createIndex('startedAt', 'startedAt');
	}
	// A finished run's summary (WP36 stage C, `26-…` §6.14) — its own store,
	// keyed by the run it summarises. Runs stored before this version simply
	// have no row here; the host folds one from the events on first read and
	// writes it back, so nothing is migrated and nothing is lost.
	if (oldVersion < 3) {
		db.createObjectStore('runSummaries', { keyPath: 'runId' });
	}
	// Campaign reports (WP38 stage D, `28-…` §4.9) — the envelope the list
	// shows, the report opaque inside; outside the run cap.
	if (oldVersion < 4) {
		db.createObjectStore('campaigns', { keyPath: 'id' });
	}
	// Evaluations (WP43, `31-EVALUATORS.md` §4.1) — one evaluator's verdict over one run, indexed by run.
	if (oldVersion < 5) {
		const evaluations = db.createObjectStore('evaluations', { keyPath: 'id' });
		evaluations.createIndex('runId', 'runId');
	}
	// Authored content (WP46, `34-CONTENT-STORE.md` §4.2) — one record per local id, by kind.
	if (oldVersion < 6) {
		const content = db.createObjectStore('content', { keyPath: 'id' });
		content.createIndex('kind', 'kind');
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
			await db.delete('runSummaries', id);
			await deleteEventsFor(db, id);
			await deleteEvaluationsIn(db, id);
		},
		async setRunPinned(id, pinned) {
			const run = await db.get('runs', id);
			if (run) await db.put('runs', { ...run, pinned });
		},

		async listGroupRuns() {
			return (await db.getAll('groupRuns')).sort(byNewestFirst);
		},
		getGroupRun: (id) => db.get('groupRuns', id),
		async putGroupRun(record) {
			await db.put('groupRuns', record);
		},
		async deleteGroupRun(id) {
			await db.delete('groupRuns', id);
			await deleteEventsFor(db, id);
		},
		async setGroupRunPinned(id, pinned) {
			const groupRun = await db.get('groupRuns', id);
			if (groupRun) await db.put('groupRuns', { ...groupRun, pinned });
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

		async putRunSummary(summary) {
			const parsed = safeParseRunSummary(summary);
			if (!parsed.success) {
				throw new Error(`Refusing to store an invalid run summary: ${parsed.error.message}`);
			}
			await db.put('runSummaries', summary);
		},
		getRunSummary: (runId) => db.get('runSummaries', runId),
		listRunSummaries: () => db.getAll('runSummaries'),

		async putCampaignReport(report) {
			const parsed = safeParseStoredCampaignReport(report);
			if (!parsed.success) {
				throw new Error(`Refusing to store an invalid campaign report: ${parsed.error.message}`);
			}
			await db.put('campaigns', report);
		},
		getCampaignReport: (id) => db.get('campaigns', id),
		async listCampaignReports() {
			return (await db.getAll('campaigns')).sort(byNewestCreated);
		},
		async deleteCampaignReport(id) {
			await db.delete('campaigns', id);
		},

		async putEvaluation(record) {
			const parsed = safeParseEvaluationRecord(record);
			if (!parsed.success) {
				throw new Error(`Refusing to store an invalid evaluation: ${parsed.error.message}`);
			}
			await db.put('evaluations', record);
		},
		listEvaluations: (runId) => db.getAllFromIndex('evaluations', 'runId', runId),
		listAllEvaluations: () => db.getAll('evaluations'),
		deleteEvaluationsFor: (runId) => deleteEvaluationsIn(db, runId),

		async putContent(record) {
			const parsed = safeParseContentRecord(record);
			if (!parsed.success) {
				throw new Error(`Refusing to store invalid content: ${parsed.error.message}`);
			}
			await db.put('content', record);
		},
		getContent: (id) => db.get('content', id),
		async listContent(kind) {
			const rows =
				kind === undefined
					? await db.getAll('content')
					: await db.getAllFromIndex('content', 'kind', kind);
			return rows.sort((a, b) => a.id.localeCompare(b.id));
		},
		deleteContent: (id) => db.delete('content', id),

		async evictOldRuns(cap = DEFAULT_RUN_CAP) {
			const doomed = selectRunsToEvict(await readRuns(), cap);
			for (const id of doomed) {
				await db.delete('runs', id);
				await db.delete('runSummaries', id);
				await deleteEventsFor(db, id);
				await deleteEvaluationsIn(db, id);
			}
			return doomed;
		},

		async clear() {
			await db.clear('agents');
			await db.clear('runs');
			await db.clear('groupRuns');
			await db.clear('events');
			await db.clear('runSummaries');
			await db.clear('campaigns');
			await db.clear('evaluations');
			await db.clear('content');
		}
	};
}

/** Every evaluation stored for a run (WP43), by the `runId` index. */
async function deleteEvaluationsIn(db: IDBPDatabase<CraftABotDB>, runId: string): Promise<void> {
	const keys = await db.getAllKeysFromIndex('evaluations', 'runId', runId);
	for (const key of keys) await db.delete('evaluations', key);
}

async function deleteEventsFor(db: IDBPDatabase<CraftABotDB>, runId: string): Promise<void> {
	const keys = await db.getAllKeysFromIndex('events', 'runId', runId);
	const tx = db.transaction('events', 'readwrite');
	for (const key of keys) await tx.store.delete(key);
	await tx.done;
}
