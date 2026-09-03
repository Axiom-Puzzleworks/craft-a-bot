import type { EngineEvent } from '../schemas/events.js';
import { emptyProjection, projectThrough, type RunProjection } from './run-projection.js';

/**
 * **The replay counterpart to `session-group.svelte.ts`'s live `absorb`**
 * (WP31, `24-ROBOT-FRIENDS-DESIGN.md` §4.5) — a pure fold over a stored group
 * episode's merged trace, for the same reason `run-projection.ts` exists at
 * all: a replay has to land on exactly what a live run showed, and the only
 * way to be sure of that is to arrive the same way.
 *
 * **Not a straight `projectThrough(mergedEvents)` call**, on purpose.
 * `run-projection.ts`'s own fold has no `agentId` awareness — it was written
 * for one bot, one session — so folding a raw two-agent merged stream through
 * it directly cross-wires the two robots' history into one set of fields.
 * Most of the time this happens to look right by coincidence (round-robin
 * means each round's events arrive as two whole blocks, so whichever member
 * acted last in a round is naturally whose face should show), but sticky
 * fields do not reset between members: if Robo ever trips a guardrail and
 * Bolt never does, a later round foregrounding Bolt would still show a
 * tripped face, borrowed from a history that is not Bolt's. `world`,
 * meanwhile, genuinely is safe to fold from the raw stream — every
 * `world.changed` payload already carries the *whole* shared room regardless
 * of which member's turn produced it, so there is nothing for a second
 * member's own events to contradict.
 */
export interface GroupReplayProjection {
	/** Whichever member's own turn produced the world as of `throughTick` — `undefined` before anyone has acted. */
	foregroundedAgentId: string | undefined;
	/** That member's own projection, folded from *only* its own events — the one `WorldView` should show. */
	member: RunProjection;
}

/**
 * Folds a group episode's merged trace up to (and including) `throughTick` —
 * the scrubber's one operation, same contract as `projectThrough` itself.
 *
 * `foregroundedAgentId` comes from the last `world.changed` at or before
 * `throughTick`, in the merged stream's own arrival order — the same rule
 * `session-group.svelte.ts`'s live `absorb` uses. That member's own events
 * are then refolded on their own, recovering the single-session subsequence
 * `projectThrough` was built for.
 */
export function projectGroupThrough(
	events: readonly EngineEvent[],
	throughTick?: number
): GroupReplayProjection {
	let foregroundedAgentId: string | undefined;
	for (const event of events) {
		if (throughTick !== undefined && event.tick > throughTick) break;
		if (event.type === 'world.changed') foregroundedAgentId = event.agentId;
	}

	if (foregroundedAgentId === undefined) {
		return { foregroundedAgentId: undefined, member: emptyProjection() };
	}

	const ownEvents = events.filter((event) => event.agentId === foregroundedAgentId);
	return { foregroundedAgentId, member: projectThrough(ownEvents, throughTick) };
}
