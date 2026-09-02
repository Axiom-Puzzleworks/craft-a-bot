import type { ContentKind, ContentRecord } from '../schemas/content.js';
import type { EngineEvent } from '../schemas/events.js';
import type {
	AgentRecord,
	GroupRunRecord,
	RunSummary,
	EvaluationRecord,
	StoredCampaignReport,
	StoredEvent
} from '../schemas/records.js';
import type { RunRecord } from '../schemas/trace-file.js';

/**
 * The persistence seam (07-DATA-MODEL-PERSISTENCE.md §8). Everything the app
 * stores goes through this interface, so tests run against an in-memory
 * implementation and the future Supabase adapter has somewhere to plug in
 * without touching a single caller.
 *
 * The contract and the in-memory implementation live here in `core` (WP36
 * stage A, `26-TARGET-DESIGN-V3.md` §6.7): a headless host has to persist runs
 * against the same shape the browser does. The IndexedDB implementation stays
 * in `apps/workbench` — it is a browser API, and `core` has no DOM access
 * (hard rule 1). The workbench re-exports this module at its old path.
 */

/** Default retention cap (07 §2). Pinned runs never count against it. */
export const DEFAULT_RUN_CAP = 50;

export interface Storage {
	/** `'file'` is the headless host's directory store (WP37, `26-…` §6.8). */
	readonly kind: 'indexeddb' | 'memory' | 'file';

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
	 * A group episode's own row (WP29, `23-MULTI-AGENT-DESIGN.md` §4.7, §10
	 * stage F) — the Run Browser's way to list an episode without scanning
	 * every member run for a shared `groupRunId`. The merged stream itself is
	 * stored the ordinary way, through `appendEvents(groupRun.id, …)`; member
	 * runs are stored the ordinary way too, through `putRun`/`appendEvents`,
	 * each carrying `RunRecord.groupRunId` back to this row's `id`.
	 */
	listGroupRuns(): Promise<GroupRunRecord[]>;
	getGroupRun(id: string): Promise<GroupRunRecord | undefined>;
	putGroupRun(record: GroupRunRecord): Promise<void>;
	deleteGroupRun(id: string): Promise<void>;
	setGroupRunPinned(id: string, pinned: boolean): Promise<void>;

	/**
	 * A finished run's own summary (WP36 stage C, `26-TARGET-DESIGN-V3.md`
	 * §6.14): the per-run facts the fleet, incident, telemetry and safety-case
	 * screens need, folded once from the trace when the run ends and kept
	 * beside its `RunRecord` — so a screen over N runs reads N small rows
	 * rather than N whole traces. The store only *keeps* summaries; the fold
	 * that produces one lives with the reports (`@craftabot/governance/reports`
	 * `summariseRun`), because the store must not know what an incident is.
	 * Deleting or evicting a run takes its summary with it, as it does its
	 * events; a run without one is folded on demand by the host and, once
	 * finished, written back.
	 */
	putRunSummary(summary: RunSummary): Promise<void>;
	getRunSummary(runId: string): Promise<RunSummary | undefined>;
	listRunSummaries(): Promise<RunSummary[]>;

	/**
	 * Campaign reports (WP38 stage D, `28-…` §4.9): an envelope the list can
	 * show and the report as opaque JSON. Newest first. Not touched by
	 * `evictOldRuns` — a report is small and is the record of an experiment,
	 * not one of the runs the cap exists to bound.
	 */
	putCampaignReport(report: StoredCampaignReport): Promise<void>;
	getCampaignReport(id: string): Promise<StoredCampaignReport | undefined>;
	listCampaignReports(): Promise<StoredCampaignReport[]>;
	deleteCampaignReport(id: string): Promise<void>;

	/**
	 * Evaluations (`31-EVALUATORS.md` §4.1, WP43): one evaluator's verdict
	 * over one run, stored beside it. Deleting or evicting a run takes its
	 * evaluations with it; `clear()` clears them.
	 */
	putEvaluation(record: EvaluationRecord): Promise<void>;
	listEvaluations(runId: string): Promise<EvaluationRecord[]>;
	listAllEvaluations(): Promise<EvaluationRecord[]>;
	deleteEvaluationsFor(runId: string): Promise<void>;

	/** Authored content (WP46, `34-CONTENT-STORE.md` §4.2) — one record per local id, listed by kind. */
	putContent(record: ContentRecord): Promise<void>;
	getContent(id: string): Promise<ContentRecord | undefined>;
	listContent(kind?: ContentKind): Promise<ContentRecord[]>;
	deleteContent(id: string): Promise<void>;

	/**
	 * Trim unpinned runs oldest-first until at most `cap` remain, deleting their
	 * events (and summaries) too. Returns the ids evicted so the UI can show
	 * the friendly notice.
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

/**
 * Newest-first by `startedAt`, which is how the shelf lists runs — and, since
 * `GroupRunRecord` carries the same field for the same reason, how the Run
 * Browser lists episodes too (WP29).
 */
export function byNewestFirst(a: { startedAt: string }, b: { startedAt: string }): number {
	return b.startedAt.localeCompare(a.startedAt);
}

/** The same rule for rows that record when they were *made* rather than started (campaign reports). */
export function byNewestCreated(a: { createdAt: string }, b: { createdAt: string }): number {
	return b.createdAt.localeCompare(a.createdAt);
}

/**
 * Which runs to drop to get back under the cap: unpinned, ungrouped only,
 * oldest first.
 *
 * `07` §2 calls this "LRU" but §8 says "oldest-first", and we do not track
 * access times — so this is oldest-first by `startedAt`, and named that way to
 * avoid reading like a broken LRU.
 *
 * **A run carrying a `groupRunId` is never a candidate here** (WP31, `24-…`
 * §4.5). `23-MULTI-AGENT-DESIGN.md` §8 left group episodes out of eviction
 * entirely on the reasoning that there was "no live producer yet... worth
 * getting right against real usage rather than guessing" — WP31 is that
 * producer, and evicting one member's own row out from under a still-live
 * `GroupRunRecord` would corrupt the episode (a shared adventure with a
 * `memberRunIds` entry that 404s) rather than merely losing a run cleanly, the
 * way an ordinary solo eviction does. Excluding grouped runs from the cap
 * entirely — rather than half-designing a group-aware retention scheme here —
 * is the same conservative choice `23-…` made, just drawn one layer deeper
 * now that the condition it was waiting on is true.
 */
export function selectRunsToEvict(runs: readonly RunRecord[], cap: number): string[] {
	const candidates = runs.filter((run) => run.groupRunId === undefined);
	const unpinned = candidates.filter((run) => !run.pinned);
	const keptPinned = candidates.length - unpinned.length;
	const allowedUnpinned = Math.max(0, cap - keptPinned);
	const excess = unpinned.length - allowedUnpinned;
	if (excess <= 0) return [];

	return [...unpinned]
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
		.slice(0, excess)
		.map((run) => run.id);
}
