import { canonicalJson, type EngineEvent, type Guardrail } from '@craftabot/core';

/**
 * **No progress** (WP141, `110-CONTROL-SUITE-PLAN.md` §10; `19-…` #7's
 * no-progress heuristic): the loop the loop-breaker cannot see.
 *
 * The loop-breaker (`no-repetition.ts`) counts the *same* call. A bot that
 * cycles through different calls that each change nothing — look the file up,
 * look the other file up, ask again in other words — never repeats itself and
 * never gets anywhere. This rule counts the turns since the world last moved:
 * a turn made progress when its call succeeded and either the world declares
 * that action progress (WP45) or the world's state after it differs from the
 * state before it. Every successful act writes the whole state on
 * `world.changed`, so the rule reads the trace and nothing else; a fork or a
 * replay judges the same.
 *
 * What it does not catch: talk. On a desk a `say` is written to the
 * transcript, which is the world's state, so a bot that keeps talking is
 * changing something. The loop-breaker holds the case where it says the same
 * thing.
 */

export const NO_PROGRESS_ID = 'safety/no-progress';

/** What the no-progress rule is told about the world. */
export interface NoProgressOptions {
	/** Whether a successful call of this action is progress (WP45), as the world declares it. */
	isProgress?: (actionName: string) => boolean;
}

/**
 * The closed turns since the world last moved, newest last. The newest
 * `decision` is the proposal being judged and has no fate yet, so it is not
 * counted.
 */
export function turnsWithoutProgress(
	history: readonly EngineEvent[],
	isProgress: (actionName: string) => boolean = () => false
): number {
	let state: string | undefined;
	let open: { progressed: boolean } | undefined;
	const closed: boolean[] = [];
	for (const event of history) {
		switch (event.type) {
			case 'decision':
				if (open) closed.push(open.progressed);
				open = { progressed: false };
				break;
			case 'action.performed':
				if (open && event.payload.result.ok && isProgress(event.payload.name))
					open.progressed = true;
				break;
			case 'world.changed': {
				const next = canonicalJson(event.payload.state);
				if (open && state !== undefined && next !== state) open.progressed = true;
				state = next;
				break;
			}
		}
	}
	let stale = 0;
	for (let i = closed.length - 1; i >= 0 && !closed[i]; i -= 1) stale += 1;
	return stale;
}

/** Stops a run whose world has not moved for `turns` turns running, whatever it tried. */
export function createNoProgressGuardrail(
	turns: number,
	options: NoProgressOptions = {}
): Guardrail {
	const isProgress = options.isProgress ?? (() => false);
	return {
		id: NO_PROGRESS_ID,
		name: 'No Progress',
		description: `Stops the run when ${turns} turns in a row have changed nothing in the world.`,
		hooks: ['pre-act'],
		check(ctx) {
			if (!ctx.proposed) return { allow: true };
			const stale = turnsWithoutProgress(ctx.history, isProgress);
			if (stale < turns)
				return { allow: true, note: `${stale} of ${turns} turns without progress` };
			return {
				allow: false,
				reason: `${stale} turns in a row have changed nothing. The run stops here rather than spend its budget going nowhere.`,
				disposition: 'stop-run'
			};
		}
	};
}
