import type { AgentRecord, RunRecord, SlotId } from '@craftabot/core';
import { filledSockets } from '$lib/bricks.js';

/**
 * **The Bench Dashboard's numbers** (`17-…` §4.1), computed from the stores the
 * Kit already writes.
 *
 * Pure, because every one of these has an edge case that is easy to get wrong
 * and invisible once it is on a tile: a run still in progress is not a failed
 * run, a fleet with no runs has no success rate at all, and "this week" needs a
 * clock somebody can control.
 *
 * The tiles are **numbers, not charts** — §4.1 says stat-tile-first and that is
 * also the right call for single headline values. §4.1's 30-day sparklines are
 * deliberately absent: they need thirty days of history, and drawing a trend
 * line through four runs would be a picture of nothing.
 */

export interface FleetRow {
	agentId: string;
	name: string;
	/** The colour strip: which sockets are filled, in build order. */
	slots: SlotId[];
	runs: number;
	lastOutcome: RunRecord['outcome'] | undefined;
	lastRunAt: string | undefined;
}

export interface Telemetry {
	runsThisWeek: number;
	/**
	 * Over **finished** runs only, and `undefined` when there are none.
	 *
	 * A run still in progress has not failed, and counting it as one would make
	 * the number drop every time somebody started playing. `undefined` rather
	 * than 0: "no runs yet" and "every run failed" must not look the same on a
	 * tile.
	 */
	successRate: number | undefined;
	/** Mean turns across successful runs; `undefined` when nothing has succeeded. */
	meanTicksToSuccess: number | undefined;
	/** Guardrail trips across the runs in scope — the Safety brick, working. */
	guardrailSaves: number;
	/** Runs in scope, finished or not. */
	runs: number;
	/**
	 * How many runs `successRate` was actually computed from.
	 *
	 * Separate from `runs` because they differ the moment anything is still in
	 * progress, and showing the total beside the rate would put a denominator on
	 * the tile that is not the one the rate used — a stronger-looking claim than
	 * the data supports, which is the failure this tile exists to avoid.
	 */
	finishedRuns: number;
}

const FINISHED = (run: RunRecord) => run.outcome !== 'IN_PROGRESS';

export function fleetRows(agents: readonly AgentRecord[], runs: readonly RunRecord[]): FleetRow[] {
	const byAgent = new Map<string, RunRecord[]>();
	for (const run of runs) {
		const list = byAgent.get(run.agentId);
		if (list) list.push(run);
		else byAgent.set(run.agentId, [run]);
	}

	return agents
		.map((agent) => {
			// Newest first, so "last run" is a fact about time rather than about
			// whatever order the store happened to return.
			const mine = (byAgent.get(agent.id) ?? []).toSorted((a, b) =>
				b.startedAt.localeCompare(a.startedAt)
			);
			const latest = mine[0];
			return {
				agentId: agent.id,
				name: agent.spec.name,
				slots: filledSockets(agent.spec.bricks),
				runs: mine.length,
				lastOutcome: latest?.outcome,
				lastRunAt: latest?.startedAt
			};
		})
		.sort(byMostRecent);
}

/**
 * Bots that have run recently first, then bots that never have.
 *
 * A fleet view is a working list, not a catalogue: the thing you were just
 * doing should be at the top, and a bot built and never run is still worth
 * showing — it is often the interesting one.
 */
const byMostRecent = (a: FleetRow, b: FleetRow) => {
	if (a.lastRunAt === b.lastRunAt) return a.name.localeCompare(b.name);
	if (a.lastRunAt === undefined) return 1;
	if (b.lastRunAt === undefined) return -1;
	return b.lastRunAt.localeCompare(a.lastRunAt);
};

export interface TelemetryInput {
	runs: readonly RunRecord[];
	/** Guardrail trips per run id — from the events, which the record does not carry. */
	savesByRun: Record<string, number>;
	/** Injected so a test is not at the mercy of the day it runs on. */
	now?: Date;
}

export function telemetryFrom({ runs, savesByRun, now = new Date() }: TelemetryInput): Telemetry {
	const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
	const finished = runs.filter(FINISHED);
	const won = finished.filter((run) => run.outcome === 'SUCCESS');

	return {
		runsThisWeek: runs.filter((run) => run.startedAt >= weekAgo).length,
		successRate: finished.length === 0 ? undefined : won.length / finished.length,
		meanTicksToSuccess:
			won.length === 0 ? undefined : won.reduce((total, run) => total + run.ticks, 0) / won.length,
		guardrailSaves: runs.reduce((total, run) => total + (savesByRun[run.id] ?? 0), 0),
		runs: runs.length,
		finishedRuns: finished.length
	};
}
