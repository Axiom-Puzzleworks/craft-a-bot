import type { Guardrail } from '@craftabot/core';

/**
 * **Action blocklist** (08-GOVERNANCE-GUARDRAILS.md §3) — the Safety Brick's
 * checkbox list. Real-world analogue: permissions and capability scoping.
 *
 * Disposition is `block-action`, never `stop-run`: a forbidden action is a
 * refused *step*, not a failed run. The engine feeds the refusal back into the
 * next observation ("You tried to open the toy chest, but a safety rule stopped
 * you: …") and the bot carries on, which is the interesting behaviour to watch
 * — §2 puts it well: the agent *experiences* governance.
 *
 * Only world actions can be blocked, not tools. The brick's UI lists actions
 * (03-UI-UX-DESIGN.md §4.3) and §3 describes the rule as an action blocklist;
 * a tool that merely looks at the world has nothing to scope.
 */

export const ACTION_BLOCKLIST_ID = 'safety/action-blocklist';

/**
 * The name the model calls an action by — its last segment (E6, `14-…` §3).
 *
 * A spec blocks `starter/playroom/celebrate`, because that is what the action
 * is called; the model proposes `celebrate`, because provider function names
 * must be plain identifiers. Comparing the two directly meant the blocklist
 * matched nothing at all the moment world ids were qualified — a governance
 * control silently failing *open*, which is the worst way for one to fail.
 */
function callName(id: string): string {
	const lastSlash = id.lastIndexOf('/');
	return lastSlash === -1 ? id : id.slice(lastSlash + 1);
}

/** Refuses any world action named in `blockedActions` at `pre-act` (`block-action`), and tells the bot why. */
export function createActionBlocklistGuardrail(blockedActions: readonly string[]): Guardrail {
	const blocked = new Set(blockedActions.map(callName));

	return {
		id: ACTION_BLOCKLIST_ID,
		name: 'Action Blocklist',
		description:
			blocked.size === 0
				? 'No actions are blocked.'
				: `Blocks these actions: ${[...blocked].join(', ')}.`,
		hooks: ['pre-act'],
		check(ctx) {
			const proposed = ctx.proposed;
			if (!proposed || proposed.kind !== 'action' || !blocked.has(callName(proposed.name))) {
				return { allow: true };
			}
			return {
				allow: false,
				reason: `${proposed.name} is on the blocked list.`,
				disposition: 'block-action'
			};
		}
	};
}
