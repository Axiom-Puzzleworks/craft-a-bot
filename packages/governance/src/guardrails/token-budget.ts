import type { Guardrail } from '@craftabot/core';

/**
 * **Token budget** (`14-…` §4.6, WP24) — the Safety Brick's cost dial, sitting
 * beside the step budget rather than replacing it: a run can be well inside
 * its turn allowance and still be spending real money per turn (a chatty
 * personality, a verbose cartridge), which `maxTicks` alone cannot see.
 *
 * Runs at pre-think, exactly like `createStepBudgetGuardrail` and for the same
 * reason: a run that has spent its token budget stops *before* paying for
 * another completion, not after. `ctx.usage.inputTokens`/`outputTokens`
 * already accumulate every response (`agent-session.ts`); this rule only
 * reads them.
 */

export const TOKEN_BUDGET_ID = 'safety/token-budget';

/** The token budget: stops the run at `pre-think` once `maxTokens` tokens have been spent. */
export function createTokenBudgetGuardrail(maxTokens: number): Guardrail {
	return {
		id: TOKEN_BUDGET_ID,
		name: 'Token Budget',
		description: `Stops the run once it has spent ${maxTokens} tokens.`,
		hooks: ['pre-think'],
		check(ctx) {
			const spent = ctx.usage.inputTokens + ctx.usage.outputTokens;
			if (spent >= maxTokens) {
				return {
					allow: false,
					reason: `The token budget of ${maxTokens} is used up.`,
					disposition: 'stop-run'
				};
			}
			return { allow: true, note: `${maxTokens - spent} tokens left` };
		}
	};
}
