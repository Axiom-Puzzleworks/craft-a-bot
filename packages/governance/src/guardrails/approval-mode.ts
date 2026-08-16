import type { Guardrail } from '@craftabot/core';

/**
 * **Approval mode** (08-GOVERNANCE-GUARDRAILS.md §3) — the Safety Brick's big
 * toggle. Real-world analogue: human-in-the-loop approval.
 *
 * The only rule of the three that returns `{ pause: true }`, which hands
 * control to the engine's approval flow: the run suspends, `approval.requested`
 * is emitted, and nothing further happens until a person answers. A denial is
 * fed back to the agent as a refusal rather than ending the run — being told
 * "no" is information, and watching a bot re-plan around it is the point.
 *
 * Actions pause; tools do not. §3 defines the rule as "every world action
 * pauses", and the distinction is the lesson: looking is free, *changing
 * things* is what needs a signature. This mirrors the tools/actions split the
 * bricks already teach (02-AGENT-MODEL.md §2).
 *
 * > **Amended 2026-08-16 (WP24):** the boolean gave way to a three-way dial
 * > (`14-…` §4.6) — `'everything'` is this rule unchanged; `'risky'` is the
 * > `19-…` §8.3 answer to confirmation fatigue, pausing only for actions whose
 * > `riskTier` is `'reversible'` or above. Governance stays ignorant of what a
 * > risk tier *is* — that is pack content (`types/world.ts`) — so `'risky'`
 * > takes the answer as an injected predicate rather than reaching for a
 * > registry itself.
 */

export const APPROVAL_MODE_ID = 'safety/approval-mode';

export type ApprovalMode = 'everything' | 'risky';

export function createApprovalModeGuardrail(
	mode: ApprovalMode,
	isRisky?: (actionName: string) => boolean
): Guardrail {
	return {
		id: APPROVAL_MODE_ID,
		name: 'Approval Mode',
		description:
			mode === 'everything'
				? 'Asks a person before the bot changes anything in the world.'
				: 'Asks a person before the bot does anything risky.',
		hooks: ['pre-act'],
		check(ctx) {
			const proposed = ctx.proposed;
			if (!proposed || proposed.kind !== 'action') return { allow: true };
			if (mode === 'risky' && !(isRisky?.(proposed.name) ?? false)) return { allow: true };
			return {
				pause: true,
				reason:
					mode === 'everything'
						? 'Approval mode is switched on, so a person checks every action first.'
						: 'This is risky enough that a person checks it first.'
			};
		}
	};
}
