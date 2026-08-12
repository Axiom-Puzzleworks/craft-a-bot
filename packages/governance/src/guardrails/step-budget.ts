import type { Guardrail } from '@craftabot/core';

/**
 * **Step budget** (08-GOVERNANCE-GUARDRAILS.md §3) — the Safety Brick's dial.
 * Real-world analogue: cost and runaway limits.
 *
 * Runs at pre-think, so a run that has spent its budget stops *before* paying
 * for another completion rather than after.
 *
 * ### Why this is a guardrail and not just a budget
 *
 * The engine already has a tick budget (`core/session/budgets.ts`), and until
 * WP8 the Safety Brick's dial simply replaced its value. That worked, but it
 * meant the brick and the platform floor were indistinguishable at the end of a
 * run: both produced "Ran out of steps".
 *
 * Splitting them makes the two-tier frame in §3 — platform floor beneath
 * user-configurable policy — something the player *sees* rather than something
 * the documentation asserts. A bot stopped by the floor ran out of steps; a bot
 * stopped by this rule was stopped by a rule its builder wrote, and gets the
 * Safety Brick end card saying so.
 *
 * > **Amended 2026-08-12 (WP8):** supersedes the WP3 note in `08` §3 that the
 * > dial "overrides" the floor. It no longer does — see `resolveBudgets`, where
 * > the floor became a backstop that never sits below the dial.
 */

export const STEP_BUDGET_ID = 'safety/step-budget';

export function createStepBudgetGuardrail(maxTicks: number): Guardrail {
	return {
		id: STEP_BUDGET_ID,
		name: 'Step Budget',
		description: `Stops the run after ${maxTicks} turns.`,
		hooks: ['pre-think'],
		check(ctx) {
			// `usage.ticks` is incremented at the top of the tick, so during
			// pre-think of turn N it already reads N. Tripping on `>=` therefore
			// matches the engine budget's timing exactly: the same number of
			// `tick.started` events, only a different outcome and end card.
			if (ctx.usage.ticks >= maxTicks) {
				return {
					allow: false,
					reason: `The step budget of ${maxTicks} ${maxTicks === 1 ? 'turn' : 'turns'} is used up.`,
					disposition: 'stop-run'
				};
			}
			return { allow: true, note: `${maxTicks - ctx.usage.ticks} turns left` };
		}
	};
}
