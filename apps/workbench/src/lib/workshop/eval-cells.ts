import type { AgentSpec, EngineEvent, RunRecord } from '@craftabot/core';
import type { EvalCell, EvalSummary } from '@craftabot/evals';
import { SEQUENTIAL_TEAL, sequential, type RampStep } from '$lib/control-room/dataviz.js';

/**
 * **The Eval Matrix's two awkward jobs** (`17-…` §4.4), kept out of the
 * component because both are arithmetic with edge cases.
 *
 * One: choosing a fill step for a success rate. Two: turning a cell that only
 * ever existed in memory into a `RunRecord` the Run Lab can open — which is
 * what "every number links to the runs behind it" costs.
 */

/**
 * **Sequential, single hue, light → dark** — `17-…` §4.4 asks for exactly that,
 * and the dataviz rule for a magnitude encoding says the same.
 *
 * **Teal, and the hue is not a free choice.** `04-…` §2.2 makes the
 * colour↔concept mapping law and `15-…` §7 rule 1 makes it identical in both
 * modes: blue is LLM, green Memory, purple Tools, sky Sense, red Actions,
 * yellow Safety. A green success-rate grid would put the Memory colour on a
 * number that has nothing to do with memory. Teal is the one hue `20-…` §2
 * designates "accent only — not a brick colour", so it is the only one a
 * magnitude ramp may use.
 *
 * Every step is paired with a label colour that clears 4.5:1 against it, and
 * the ramp deliberately **skips the middle band** where neither ink nor cream
 * passes — the first attempt ran straight through it and produced a row of
 * cells whose own numbers were unreadable. Luminance is strictly decreasing,
 * which is the check that actually applies to a sequential ramp.
 */
export const SUCCESS_RAMP = SEQUENTIAL_TEAL;
export type { RampStep };

/**
 * Since WP57 (`44-CONTROL-ROOM.md` §4.3) the six steps above live in the
 * Control Room's grammar as `SEQUENTIAL_TEAL` — byte-identical — and this
 * is the grammar's `sequential` over them. The screen keeps calling it
 * until WP71 puts the grid on `Matrix`.
 */
export function rampStep(rate: number): RampStep {
	return sequential(rate, SEQUENTIAL_TEAL);
}

/** The square of the grid a summary belongs to. */
export const squareKey = (goalCardId: string, brainId: string) => `${goalCardId} × ${brainId}`;

export function summaryAt(
	summaries: readonly EvalSummary[],
	goalCardId: string,
	brainId: string
): EvalSummary | undefined {
	return summaries.find((s) => s.goalCardId === goalCardId && s.brainId === brainId);
}

/**
 * A cell's run, as a record the Run Browser and Run Lab already understand.
 *
 * Assembled rather than stored: matrix cells run in memory and never touch the
 * run store, because a 240-cell matrix would evict every run a child had made
 * (the store trims oldest-first). Only the run somebody actually asks to open
 * is written, and this is what it is written as.
 *
 * **The identity fields come from `run.started`, not from assumptions** — E8
 * put the effective budgets, the provider and the wire model in that event
 * precisely so a record could be honest about what a run was actually held to.
 */
export function recordForCell(
	cell: EvalCell,
	events: readonly EngineEvent[],
	spec: AgentSpec
): RunRecord | undefined {
	const started = events.find((event) => event.type === 'run.started');
	if (started?.type !== 'run.started' || cell.runId === undefined) return undefined;

	const finished = events.findLast((event) => event.type === 'run.finished');

	return {
		id: cell.runId,
		agentId: spec.id,
		// Named for the cell, so it is obvious in the Run Browser that this run
		// came from a matrix rather than from somebody playing.
		agentName: `eval · ${cell.goalCardId.replace(/^.*\//, '')} · ${cell.brainId} · seed ${cell.seed}`,
		goalCardId: cell.goalCardId,
		specSnapshot: spec,
		packVersions: {},
		mode: started.payload.mode,
		outcome: cell.metrics.outcome ?? 'IN_PROGRESS',
		ticks: cell.metrics.ticksUsed,
		usage: { inputTokens: cell.metrics.tokensIn, outputTokens: cell.metrics.tokensOut },
		budgets: started.payload.budgets,
		providerId: started.payload.providerId,
		wireModel: started.payload.wireModel,
		// Never pinned on arrival: pinning is something a person does.
		pinned: false,
		startedAt: started.timestamp,
		...(finished ? { finishedAt: finished.timestamp } : {}),
		schemaVersion: 2
	};
}
