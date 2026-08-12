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
 */

export const APPROVAL_MODE_ID = 'safety/approval-mode';

export function createApprovalModeGuardrail(): Guardrail {
	return {
		id: APPROVAL_MODE_ID,
		name: 'Approval Mode',
		description: 'Asks a person before the bot changes anything in the world.',
		hooks: ['pre-act'],
		check(ctx) {
			const proposed = ctx.proposed;
			if (!proposed || proposed.kind !== 'action') return { allow: true };
			return {
				pause: true,
				reason: 'Approval mode is switched on, so a person checks every action first.'
			};
		}
	};
}
