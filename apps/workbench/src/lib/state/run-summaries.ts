import type { EngineEvent, RunRecord, RunSummary, Storage } from '@craftabot/core';
import { summariseRun } from '@craftabot/governance/reports';

/**
 * **Run summaries, kept honest** (WP36 stage C, `26-…` §6.14).
 *
 * The store keeps a `RunSummary` beside each finished run so the Workshop's
 * fleet, incident, telemetry and safety-case screens read N small rows rather
 * than N whole traces — the N+1 those four screens all carried since WP34,
 * bounded only by the run cap. Two rules keep the cache truthful:
 *
 * - **A finished run's summary is written once, when it finishes**
 *   (`persistRunSummary`, called by every path that stores a finished run:
 *   the Play routes, the group recorder, the Armour Studio, the Eval Matrix's
 *   drill-through, and a trace import).
 * - **A run with no summary is folded on demand** — every run stored before
 *   this stage, and any run still in progress. A finished one is written back
 *   so the next read is cheap; an in-progress one is never written, because a
 *   summary of a run that is still changing would be stale the moment it was
 *   stored (`ensureRunSummaries`).
 *
 * The fold itself lives with the reports, not here: this module only decides
 * *when* to fold and *whether* to keep the answer.
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
