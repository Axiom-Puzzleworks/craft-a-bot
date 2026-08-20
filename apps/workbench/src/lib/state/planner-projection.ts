import type { EngineEvent } from '@craftabot/core';
import type { PlannerState } from '@craftabot/pack-starter';

/**
 * **The Planner brick's live checklist, folded from `brick.state`** (WP30
 * stage C, `02-…` §7's own amendment).
 *
 * The same shape as `run-projection.ts`'s trio — `empty*`/`apply*`/
 * `project*Through` — and for the same reason: a live view and a replay must
 * fold the identical way or "pixel-consistent with a live run" (`16-…` §1.4)
 * stops being true the first time either path changes. Kept as its own
 * sibling module rather than folded into `RunProjection` itself, so that file
 * stays brick-agnostic — it knows about world/thought/tick, generic engine
 * concepts, and nothing about any one pack's own brick.
 */
export interface PlannerProjection {
	/** `undefined` until the run's first `brick.state` for a Planner brick arrives. */
	state: PlannerState | undefined;
}

export function emptyPlannerProjection(): PlannerProjection {
	return { state: undefined };
}

/** Fold one event into the projection. Ignores everything but its own brick's reports. */
export function applyPlannerEvent(projection: PlannerProjection, event: EngineEvent): void {
	if (event.type !== 'brick.state' || event.payload.kind !== 'starter/planner') return;
	// Cast: `brick.state.state` is opaque to core by design (`types/brick.ts`'s
	// own `contributeState` doc comment) — this is the one place that knows
	// which kind id pairs with which shape.
	projection.state = event.payload.state as PlannerState;
}

export function projectPlannerThrough(
	events: readonly EngineEvent[],
	throughTick?: number
): PlannerProjection {
	const projection = emptyPlannerProjection();
	for (const event of events) {
		if (throughTick !== undefined && event.tick > throughTick) break;
		applyPlannerEvent(projection, event);
	}
	return projection;
}
