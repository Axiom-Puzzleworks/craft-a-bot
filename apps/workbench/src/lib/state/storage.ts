import type { AgentRecord, EngineEvent, RunRecord, StoredEvent } from '@craftabot/core';

/**
 * The persistence seam (07-DATA-MODEL-PERSISTENCE.md §8). Everything the app
 * stores goes through this interface, so tests run against an in-memory
 * implementation and the future Supabase adapter has somewhere to plug in
 * without touching a single caller.
 *
 * It lives in the app rather than in a package because IndexedDB is a browser
 * API, and `core`/packs are allowed no DOM access (hard rule 1).
 */

/** Default retention cap (07 §2). Pinned runs never count against it. */
export const DEFAULT_RUN_CAP = 50;

export interface Storage {
	readonly kind: 'indexeddb' | 'memory';

	listAgents(): Promise<AgentRecord[]>;
	getAgent(id: string): Promise<AgentRecord | undefined>;
	putAgent(record: AgentRecord): Promise<void>;
	deleteAgent(id: string): Promise<void>;

	/** Newest first. */
	listRuns(): Promise<RunRecord[]>;
	getRun(id: string): Promise<RunRecord | undefined>;
	putRun(record: RunRecord): Promise<void>;
	deleteRun(id: string): Promise<void>;
	setRunPinned(id: string, pinned: boolean): Promise<void>;

	appendEvents(runId: string, events: readonly EngineEvent[]): Promise<void>;
	/** Ordered by `seq` — the ordering guarantee the trace depends on. */
	getEvents(runId: string): Promise<StoredEvent[]>;
	deleteEvents(runId: string): Promise<void>;

	/**
	 * Trim unpinned runs oldest-first until at most `cap` remain, deleting their
	 * events too. Returns the ids evicted so the UI can show the friendly notice.
	 */
	evictOldRuns(cap?: number): Promise<string[]>;

	/** Drops everything — "Forget everything" in settings (06-LLM-PROVIDERS.md §6). */
	clear(): Promise<void>;
}

/**
 * Rows that fail their schema are skipped rather than thrown
 * (07 §1.5: "invalid data degrades gracefully — quarantined, never crashes the
 * app"). Callers can surface the count; nothing else needs to care.
 */
export interface QuarantineReport {
	agents: number;
	runs: number;
	events: number;
}

export function emptyQuarantine(): QuarantineReport {
	return { agents: 0, runs: 0, events: 0 };
}

/** Newest-first by `startedAt`, which is how the shelf lists runs. */
export function byNewestFirst(a: RunRecord, b: RunRecord): number {
	return b.startedAt.localeCompare(a.startedAt);
}

/**
 * Which runs to drop to get back under the cap: unpinned only, oldest first.
 *
 * `07` §2 calls this "LRU" but §8 says "oldest-first", and we do not track
 * access times — so this is oldest-first by `startedAt`, and named that way to
 * avoid reading like a broken LRU.
 */
export function selectRunsToEvict(runs: readonly RunRecord[], cap: number): string[] {
	const unpinned = runs.filter((run) => !run.pinned);
	const keptPinned = runs.length - unpinned.length;
	const allowedUnpinned = Math.max(0, cap - keptPinned);
	const excess = unpinned.length - allowedUnpinned;
	if (excess <= 0) return [];

	return [...unpinned]
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
		.slice(0, excess)
		.map((run) => run.id);
}
