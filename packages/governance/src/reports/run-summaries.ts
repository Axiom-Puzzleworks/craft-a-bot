import type { EngineEvent, RunRecord, RunSummary, Storage } from '@craftabot/core';
import { summariseRun } from './summary.js';

/**
 * **Run summaries, kept honest** (WP36 stage C; here since WP37 stage C so
 * the headless host reports by the same rule the Workshop's screens do).
 *
 * The store keeps a `RunSummary` beside each finished run so a report over N
 * runs reads N small rows rather than N whole traces. Two rules keep the
 * cache truthful:
 *
 * - **A finished run's summary is written once, when it finishes**
 *   (`persistRunSummary`, called by every path that stores a finished run).
 * - **A run with no summary is folded on demand** — every run stored before
 *   summaries existed, and any run still in progress. A finished one is
 *   written back so the next read is cheap; an in-progress one is never
 *   written, because a summary of a run that is still changing would be stale
 *   the moment it was stored (`ensureRunSummaries`).
 *
 * This module decides *when* to fold and *whether* to keep the answer; the
 * fold itself is `summariseRun`.
 */
export async function ensureRunSummaries(
	storage: Storage,
	runs: readonly RunRecord[]
): Promise<Map<string, RunSummary>> {
	const summaries = new Map<string, RunSummary>();
	for (const run of runs) {
		const stored = await storage.getRunSummary(run.id);
		if (stored) {
			summaries.set(run.id, stored);
			continue;
		}
		const events = (await storage.getEvents(run.id)).map((row) => row.event);
		const summary = summariseRun(run.id, events);
		if (run.outcome !== 'IN_PROGRESS') await storage.putRunSummary(summary);
		summaries.set(run.id, summary);
	}
	return summaries;
}

/** Fold a finished run's events and keep the answer. */
export async function persistRunSummary(
	storage: Storage,
	runId: string,
	events: readonly EngineEvent[]
): Promise<void> {
	await storage.putRunSummary(summariseRun(runId, events));
}
