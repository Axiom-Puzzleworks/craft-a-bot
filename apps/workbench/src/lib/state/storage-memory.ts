import {
	safeParseAgentRecord,
	safeParseStoredEvent,
	type AgentRecord,
	type RunRecord,
	type StoredEvent
} from '@craftabot/core';
import {
	DEFAULT_RUN_CAP,
	byNewestFirst,
	emptyQuarantine,
	selectRunsToEvict,
	type QuarantineReport,
	type Storage
} from './storage.js';

/**
 * The in-memory store. Not merely a test double — this is the real fallback
 * when IndexedDB is unavailable (private browsing, corporate lockdown), where
 * the app runs fully in memory and warns that nothing will survive a reload
 * (07-DATA-MODEL-PERSISTENCE.md §8). That is exactly why it and the IndexedDB
 * implementation share one contract test suite.
 */

export interface MemoryStorage extends Storage {
	readonly kind: 'memory';
	quarantined(): QuarantineReport;
}

/** Undefined passes straight through; everything else is deep-copied. */
function copy<T>(value: T): T {
	return value === undefined ? value : structuredClone(value);
}

export function createMemoryStorage(): MemoryStorage {
	const agents = new Map<string, AgentRecord>();
	const runs = new Map<string, RunRecord>();
	const events = new Map<string, StoredEvent[]>();
	const quarantine = emptyQuarantine();

	return {
		kind: 'memory',
		quarantined: () => ({ ...quarantine }),

		// Reads clone too, not just writes: IndexedDB hands back a freshly
		// deserialised object every time, so an in-memory store that returned live
		// references would behave differently from the durable one — and only for
		// the private-browsing users least likely to report it.
		listAgents: () => Promise.resolve([...agents.values()].map(copy)),
		getAgent: (id) => Promise.resolve(copy(agents.get(id))),
		putAgent(record) {
			// Validated on the way in as well as out: a bad record should never
			// reach the store, whichever implementation is behind the interface.
			const parsed = safeParseAgentRecord(record);
			if (!parsed.success) {
				quarantine.agents += 1;
				return Promise.reject(
					new Error(`Refusing to store an invalid agent: ${parsed.error.message}`)
				);
			}
			agents.set(record.id, structuredClone(record));
			return Promise.resolve();
		},
		deleteAgent(id) {
			agents.delete(id);
			return Promise.resolve();
		},

		listRuns: () => Promise.resolve([...runs.values()].sort(byNewestFirst).map(copy)),
		getRun: (id) => Promise.resolve(copy(runs.get(id))),
		putRun(record) {
			runs.set(record.id, structuredClone(record));
			return Promise.resolve();
		},
		deleteRun(id) {
			runs.delete(id);
			events.delete(id);
			return Promise.resolve();
		},
		setRunPinned(id, pinned) {
			const run = runs.get(id);
			if (run) runs.set(id, { ...run, pinned });
			return Promise.resolve();
		},

		appendEvents(runId, incoming) {
			const existing = events.get(runId) ?? [];
			let seq = existing.length;
			for (const event of incoming) {
				const stored: StoredEvent = { runId, seq, event };
				const parsed = safeParseStoredEvent(stored);
				if (!parsed.success) {
					quarantine.events += 1;
					continue;
				}
				existing.push(structuredClone(stored));
				seq += 1;
			}
			events.set(runId, existing);
			return Promise.resolve();
		},
		getEvents(runId) {
			const stored = events.get(runId) ?? [];
			return Promise.resolve([...stored].sort((a, b) => a.seq - b.seq).map(copy));
		},
		deleteEvents(runId) {
			events.delete(runId);
			return Promise.resolve();
		},

		async evictOldRuns(cap = DEFAULT_RUN_CAP) {
			const doomed = selectRunsToEvict([...runs.values()], cap);
			for (const id of doomed) {
				runs.delete(id);
				events.delete(id);
			}
			return Promise.resolve(doomed);
		},

		clear() {
			agents.clear();
			runs.clear();
			events.clear();
			return Promise.resolve();
		}
	};
}
