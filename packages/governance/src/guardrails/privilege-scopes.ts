import type { EngineEvent, Guardrail, GuardrailVerdict } from '@craftabot/core';

/**
 * **Least privilege with recorded elevation** (WP142,
 * `110-CONTROL-SUITE-PLAN.md` §10; `19-…` #15; Progent's privilege control).
 *
 * A rule over a set of *governed* calls, of which the bot starts with some
 * *granted*. A governed call outside the grant is either refused
 * (`block-action`, the step refused and the run going on) or paused for a
 * person as an **elevation**: the verdict names the scope, and the session
 * writes `elevation.requested` and `elevation.resolved` beside the approval
 * pair it rides on. A scope a person granted stays granted for the run, read
 * back from the trace, so the second call does not ask again and a fork or
 * replay judges the same. Calls the rule does not govern pass untouched.
 *
 * The Connector's scopes are its first instance: `connector/tool-blocklist`
 * is this rule in refuse mode over the line's operations, granted the ones
 * `scopes` names (`tool-blocklist.ts`).
 */

/** The name the model calls a tool or action by — its last segment (E6, `14-…` §3). */
export function callName(id: string): string {
	const lastSlash = id.lastIndexOf('/');
	return lastSlash === -1 ? id : id.slice(lastSlash + 1);
}

/** How a call outside the grant is answered. */
export type ElevationMode = 'refuse' | 'ask';

/** What the rule governs and grants. */
export interface PrivilegeScopesOptions {
	id: string;
	name: string;
	description: string;
	/** The calls the rule governs, by id or name; any other call passes untouched. */
	governed: readonly string[];
	/** The governed calls the bot starts with. */
	granted: readonly string[];
	onElevation: ElevationMode;
	/** The kinds of call governed; both when absent. */
	kinds?: ReadonlyArray<'tool' | 'action'>;
	/** The words a refusal gives the bot, when the rule has its own. */
	refusal?: (callName: string) => string;
}

/** The scopes a person granted so far this run, from the trace. */
export function grantedElevations(history: readonly EngineEvent[]): Set<string> {
	const granted = new Set<string>();
	for (const event of history)
		if (event.type === 'elevation.resolved' && event.payload.granted)
			granted.add(event.payload.scope);
	return granted;
}

/** The rule: refuse, or ask to elevate, a governed call outside the grant. */
export function createPrivilegeScopesGuardrail(options: PrivilegeScopesOptions): Guardrail {
	const governed = new Set(options.governed.map(callName));
	const granted = new Set(options.granted.map(callName));
	return {
		id: options.id,
		name: options.name,
		description: options.description,
		hooks: ['pre-act'],
		check(ctx): GuardrailVerdict {
			const proposed = ctx.proposed;
			if (!proposed) return { allow: true };
			if (options.kinds && !options.kinds.includes(proposed.kind as 'tool' | 'action'))
				return { allow: true };
			const scope = callName(proposed.name);
			if (!governed.has(scope) || granted.has(scope)) return { allow: true };
			if (options.onElevation === 'refuse')
				return {
					allow: false,
					reason:
						options.refusal?.(proposed.name) ?? `${scope} is outside this bot’s granted scopes.`,
					disposition: 'block-action'
				};
			if (grantedElevations(ctx.history).has(scope)) return { allow: true };
			return {
				pause: true,
				reason: `${scope} is outside this bot’s granted scopes; a person may grant it for the rest of the run.`,
				elevation: { scope }
			};
		}
	};
}
