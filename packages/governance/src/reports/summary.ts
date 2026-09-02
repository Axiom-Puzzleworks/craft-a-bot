import type { EngineEvent, RunRecord, RunSummary } from '@craftabot/core';
import { findingsIn } from './incidents.js';

/**
 * **The one fold that makes a `RunSummary`** (WP36 stage C, `26-…` §6.14).
 *
 * Everything the fleet dashboard, the incident log, the telemetry breakdowns
 * and the safety case ever read out of a trace, counted once. Every report in
 * this package is written *over summaries*; the event-taking signatures they
 * kept from before this stage are thin wrappers that call `summariesOf` first
 * — so the events path and the summary path cannot disagree, because there is
 * only one path. `summary.test.ts` holds that as a property rather than
 * trusting it.
 *
 * Deliberately not a metric fold (`@craftabot/evals`'s `scoreRun` is that):
 * nothing here is a score, and nothing here needs a world.
 */
export function summariseRun(runId: string, events: readonly EngineEvent[]): RunSummary {
	let checks = 0;
	let saves = 0;
	let approvalsRequested = 0;
	let approvalsGranted = 0;
	let decisions = 0;
	let hostedPreActScreens = 0;
	let egress: RunSummary['egress'];
	const guardrailTrips: Record<string, number> = {};

	for (const event of events) {
		switch (event.type) {
			case 'guardrail.checked':
				checks += 1;
				break;
			case 'guardrail.tripped':
				saves += 1;
				guardrailTrips[event.payload.guardrailId] =
					(guardrailTrips[event.payload.guardrailId] ?? 0) + 1;
				break;
			case 'approval.resolved':
				approvalsRequested += 1;
				if (event.payload.approved) approvalsGranted += 1;
				break;
			case 'decision':
				if (event.payload.call !== null) decisions += 1;
				break;
			case 'guardrail.external':
				if (event.payload.hook === 'pre-act') hostedPreActScreens += 1;
				break;
			case 'run.started':
				// Where the run could call (WP41) — present once the host named a mode.
				if (event.payload.egress) egress = event.payload.egress;
				break;
			default:
				break;
		}
	}

	return {
		runId,
		checks,
		saves,
		guardrailTrips,
		approvalsRequested,
		approvalsGranted,
		findings: findingsIn(events),
		decisions,
		hostedPreActScreens,
		...(egress ? { egress } : {}),
		schemaVersion: 1
	};
}

/** One summary per run, folded from the events on hand — the wrappers' way in. */
export function summariesOf(
	runs: readonly RunRecord[],
	eventsByRun: ReadonlyMap<string, readonly EngineEvent[]>
): Map<string, RunSummary> {
	return new Map(runs.map((run) => [run.id, summariseRun(run.id, eventsByRun.get(run.id) ?? [])]));
}
