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

/** Which proposed calls pause for a person: every one, or only the risky ones. */
export type ApprovalMode = 'everything' | 'risky';

/** The human-approval gate (`08-…` §3): pauses the run at `pre-act` for a person's yes or no, as `mode` says. */
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

/**
 * **Adaptive approval** (WP149, `110-CONTROL-SUITE-PLAN.md` §10;
 * confirmation fatigue): a person asked about everything soon approves
 * without reading. This mode asks about every action until `fatigueAfter`
 * approvals have been asked this run, then only about what changes the
 * world (reversible or irreversible), and after twice that only about what
 * cannot be undone. The count is read from the trace (`approval.requested`),
 * so a fork or a replay asks the same.
 */
export function createAdaptiveApprovalGuardrail(
	fatigueAfter: number,
	tierOf: (actionName: string) => 'observe' | 'reversible' | 'irreversible' = () => 'irreversible'
): Guardrail {
	return {
		id: APPROVAL_MODE_ID,
		name: 'Approval Mode',
		description: `Asks a person before every action, then — after ${fatigueAfter} asks — only before what changes the world, and after ${fatigueAfter * 2} only before what cannot be undone.`,
		hooks: ['pre-act'],
		check(ctx) {
			const proposed = ctx.proposed;
			if (!proposed || proposed.kind !== 'action') return { allow: true };
			const asked = ctx.history.filter((event) => event.type === 'approval.requested').length;
			const tier = tierOf(proposed.name);
			const needs =
				asked < fatigueAfter
					? true
					: asked < fatigueAfter * 2
						? tier !== 'observe'
						: tier === 'irreversible';
			if (!needs) return { allow: true, note: `${asked} asked already; ${tier} goes without one` };
			return {
				pause: true,
				reason:
					asked < fatigueAfter
						? 'A person checks every action first.'
						: 'A person has been asked often already, so only this one, which matters most, waits for them.'
			};
		}
	};
}
