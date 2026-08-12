import type { ChatResponse } from '../types/provider.js';

/**
 * DECIDE (02-AGENT-MODEL.md §5 step 5): turn a provider response into a thought
 * plus at most one call.
 *
 * "Malformed" is defined narrowly on purpose: **no call and no thought text**.
 * A bot that thinks without acting is thinking, not mumbling — that is a
 * perfectly good tick, and treating it as an error would punish exactly the
 * hesitant behaviour the tutorial wants users to observe. Likewise a call
 * naming something the bot does not have is *not* malformed; it is routed as an
 * action so the world can narrate the failure warmly ("You do not know how to
 * teleport."), which teaches far better than an engine error.
 */

export type DecisionCall = {
	kind: 'tool' | 'action';
	name: string;
	arguments: unknown;
};

export type Decision =
	| { kind: 'malformed'; raw: string }
	| { kind: 'thought-only'; thought: string }
	| { kind: 'call'; thought: string; call: DecisionCall };

export interface AvailableCalls {
	toolNames: ReadonlySet<string>;
	actionNames: ReadonlySet<string>;
}

export function decide(response: ChatResponse, available: AvailableCalls): Decision {
	const thought = response.text.trim();
	const toolCall = response.toolCall;

	if (!toolCall || toolCall.name.trim() === '') {
		return thought === ''
			? { kind: 'malformed', raw: response.text }
			: { kind: 'thought-only', thought };
	}

	const name = toolCall.name.trim();
	const kind =
		available.toolNames.has(name) && !available.actionNames.has(name) ? 'tool' : 'action';

	return { kind: 'call', thought, call: { kind, name, arguments: toolCall.arguments } };
}

/**
 * The stricter nudge sent on the single re-prompt after a mumble
 * (03-UI-UX-DESIGN.md §9). Kept here beside the definition of "malformed" so
 * the two never drift.
 */
export const REPROMPT_INSTRUCTION =
	'Your last reply was empty. Reply again: say briefly what you are thinking, and then either call exactly one of your tools or actions, or say what you plan to do next.';
