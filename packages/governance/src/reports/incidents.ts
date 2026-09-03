import type { EngineEvent, RunRecord, RunSummary, RunSummaryFinding } from '@craftabot/core';
import { isFailure } from './failures.js';
import { summariesOf } from './summary.js';

/**
 * **The incident log** (`19-…` #31, WP34 stage B) — derived, not authored.
 *
 * `isFailure` already answers "what went wrong in a run" (its own doc
 * comment: "the question an incident starts with"), so an incident is exactly
 * that, reused rather than redefined: a stored run carrying at least one
 * failing event, with each one tagged by a small, OECD-taxonomy-shaped kind.
 * There is no second store here and no authoring UI — the trace stays the one
 * source of truth (07 §1.5, and the same scope line `17-…` §4.7 already drew
 * for the Test Bench's own assertion cards: a content-authoring store is a
 * real feature with its own id-collision and versioning questions, not a
 * rider on the screen that first wants one).
 *
 * Since WP36 stage C the findings are carried on each run's `RunSummary`, so
 * the log lists without re-reading a trace; `incidentsFrom` over events is
 * kept as a wrapper that summarises first.
 */

export type IncidentFinding = RunSummaryFinding;
/** The kinds of finding an incident carries. */
export type IncidentKind = IncidentFinding['kind'];

/** A run that went wrong, with the findings that say how. */
export interface Incident {
	runId: string;
	agentId: string;
	agentName: string;
	goalCardId: string;
	outcome: RunRecord['outcome'];
	startedAt: string;
	findings: IncidentFinding[];
}

/**
 * Every stored run with at least one finding, newest first. A run with a
 * clean trace is not an incident and does not appear — an empty log is the
 * honest report for a fleet that has never tripped anything.
 */
export function incidentsFromSummaries(
	runs: readonly RunRecord[],
	summaries: ReadonlyMap<string, RunSummary>
): Incident[] {
	return runs
		.map((run) => ({ run, findings: summaries.get(run.id)?.findings ?? [] }))
		.filter((entry) => entry.findings.length > 0)
		.map(({ run, findings }) => ({
			runId: run.id,
			agentId: run.agentId,
			agentName: run.agentName,
			goalCardId: run.goalCardId,
			outcome: run.outcome,
			startedAt: run.startedAt,
			findings: [...findings]
		}))
		.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** The pre-summary signature, kept: fold the events into summaries, then list. */
export function incidentsFrom(
	runs: readonly RunRecord[],
	eventsByRun: ReadonlyMap<string, readonly EngineEvent[]>
): Incident[] {
	return incidentsFromSummaries(runs, summariesOf(runs, eventsByRun));
}

/** The per-event lines a run's summary carries — `summariseRun`'s own source for `findings`. */
export function findingsIn(events: readonly EngineEvent[]): IncidentFinding[] {
	return events
		.filter(isFailure)
		.map((event) => ({ kind: kindOf(event), tick: event.tick, summary: summarise(event, events) }));
}

function kindOf(event: EngineEvent): IncidentKind {
	switch (event.type) {
		case 'error':
			return 'error';
		case 'guardrail.tripped':
			return 'guardrail-catch';
		case 'action.performed':
			return 'action-failure';
		case 'approval.resolved':
			return 'approval-denied';
		case 'run.finished':
			return 'run-failure';
		/* istanbul ignore next -- `isFailure` never lets another type through */
		default:
			return 'error';
	}
}

function summarise(event: EngineEvent, events: readonly EngineEvent[]): string {
	switch (event.type) {
		case 'error':
			return event.payload.message;
		case 'guardrail.tripped':
			return event.payload.reason;
		case 'action.performed':
			return event.payload.result.narration;
		case 'approval.resolved': {
			// The denial itself carries no reason (`{ approved: false }`) — the
			// request it answers, the same tick, does.
			const request = events.find(
				(candidate) => candidate.type === 'approval.requested' && candidate.tick === event.tick
			);
			return request?.type === 'approval.requested'
				? `A person said no: ${request.payload.reason}`
				: 'A person said no.';
		}
		case 'run.finished':
			return `The run ended ${event.payload.outcome}.`;
		/* istanbul ignore next -- `isFailure` never lets another type through */
		default:
			return event.type;
	}
}
