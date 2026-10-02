import type { Guardrail } from '@craftabot/core';
import { callName, createPrivilegeScopesGuardrail } from './privilege-scopes.js';

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

/**
 * Refuses any tool call named in `blockedTools` at `pre-act` (`block-action`), and tells the bot why.
 *
 * > **Amended 2026-10-02 (WP142):** the first instance of the privilege-scopes
 * > rule (`privilege-scopes.ts`) — the blocked tools governed, none granted,
 * > refused — with this rule's own id, description and words, so every trace
 * > it wrote reads the same.
 */
export function createToolBlocklistGuardrail(blockedTools: readonly string[]): Guardrail {
	const blocked = [...new Set(blockedTools.map(callName))];
	return createPrivilegeScopesGuardrail({
		id: TOOL_BLOCKLIST_ID,
		name: 'Tool Blocklist',
		description:
			blocked.length === 0 ? 'No tools are blocked.' : `Blocks these tools: ${blocked.join(', ')}.`,
		governed: blocked,
		granted: [],
		onElevation: 'refuse',
		kinds: ['tool'],
		refusal: (name) => `${name} is on the blocked list.`
	});
}
