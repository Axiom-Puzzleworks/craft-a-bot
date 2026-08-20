import type { Guardrail } from '@craftabot/core';

/**
 * **Tool blocklist** (WP32 stage B, `14-…` §5.6) — the Connector brick's own
 * scope enforcement. Real-world analogue: an API token whose scope grant is
 * narrower than the connection it rides on.
 *
 * `createActionBlocklistGuardrail`'s own mirror, for `tool` calls instead of
 * `action` ones — deliberately a sibling file rather than a shared parameter
 * on that one: the two guard different things for different reasons (a
 * child's own tick-box list of world actions; a brick-computed set of
 * out-of-scope operations nobody ticks by hand), and forcing one function to
 * speak both would have coupled the Safety Brick's own wording to a brick
 * that does not exist yet when `action-blocklist.ts` was written.
 *
 * Disposition is `block-action`, the same as the action blocklist: a refused
 * *step*, not a failed run — the bot tried something outside its scope, was
 * told so, and carries on.
 */

export const TOOL_BLOCKLIST_ID = 'connector/tool-blocklist';

/** The name the model calls a tool by — its last segment (E6, `14-…` §3). */
function callName(id: string): string {
	const lastSlash = id.lastIndexOf('/');
	return lastSlash === -1 ? id : id.slice(lastSlash + 1);
}

export function createToolBlocklistGuardrail(blockedTools: readonly string[]): Guardrail {
	const blocked = new Set(blockedTools.map(callName));

	return {
		id: TOOL_BLOCKLIST_ID,
		name: 'Tool Blocklist',
		description:
			blocked.size === 0
				? 'No tools are blocked.'
				: `Blocks these tools: ${[...blocked].join(', ')}.`,
		hooks: ['pre-act'],
		check(ctx) {
			const proposed = ctx.proposed;
			if (!proposed || proposed.kind !== 'tool' || !blocked.has(callName(proposed.name))) {
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
