import type { MockScript, MockTurn } from '@craftabot/core/testing';
import {
	advanceCounterpart,
	freshCounterpartMemory,
	type CounterpartMemory,
	type CounterpartScript
} from './counterpart.js';
import { runtimeStrings } from './strings.js';

/**
 * **The `scripted-counterpart` brain** (WP55 stage B, `46-COUNTERPARTS.md`
 * §4.5): a mock brain that drives a live counterpart seat along a
 * `CounterpartScript`, so a two-seat episode reproduces in CI without a
 * model. It reads the seat's last observation (the last `user` message),
 * finds the most recent line in the conversation block that the seat did
 * not say itself, advances the same interpreter the desk runtime uses, and
 * answers with `say` — or `hang-up` when the rule ends the conversation, or
 * a thought with no call when there is nothing to say.
 *
 * Lives beside the interpreter rather than in `evals` (`46-…` §8): `evals`
 * depends on this package, so the brain cannot be there without a cycle.
 * `evals` re-exports it under the tier's name.
 */
export interface ScriptedCounterpartOptions {
	/** The seat's own display name — its lines are skipped when finding the agent's. */
	selfName: string;
	/** A seed for a rule's `say: string[]` pick; default the script's own order. */
	random?: () => number;
}

const SAY = 'say';
const HANG_UP = 'hang-up';

export function scriptedCounterpart(
	script: CounterpartScript,
	options: ScriptedCounterpartOptions
): MockScript {
	let memory: CounterpartMemory = freshCounterpartMemory();
	let ticks = 0;
	const random = options.random ?? (() => 0);
	return (request): MockTurn => {
		ticks += 1;
		const observation =
			[...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
		const said = lastAgentLine(observation, options.selfName);
		const { turn, memory: next } = advanceCounterpart(
			script,
			said === undefined ? { kind: 'tick' } : { kind: 'said', text: said },
			memory,
			ticks,
			random
		);
		memory = next;
		if (!turn) return { text: runtimeStrings.counterpartBrain.waiting, toolCall: null };
		if (turn.then === 'end-conversation') {
			return {
				text: turn.text ?? runtimeStrings.counterpartBrain.leaving,
				toolCall: {
					name: HANG_UP,
					arguments: { ...(turn.text !== undefined ? { reason: turn.text } : {}) }
				}
			};
		}
		if (turn.text === undefined)
			return { text: runtimeStrings.counterpartBrain.waiting, toolCall: null };
		return { text: turn.text, toolCall: { name: SAY, arguments: { text: turn.text } } };
	};
}

/**
 * The most recent line in the observation's conversation block not spoken by
 * the seat itself. The block is the runtime's own format — a heading line
 * and then `  Name: text` lines — so the parser and the writer cannot drift.
 */
export function lastAgentLine(observation: string, selfName: string): string | undefined {
	const lines = observation.split('\n');
	for (let index = lines.length - 1; index >= 0; index -= 1) {
		const raw = lines[index] ?? '';
		if (!raw.startsWith('  ')) continue;
		const colon = raw.indexOf(': ');
		if (colon === -1) continue;
		const speaker = raw.slice(2, colon);
		if (speaker === selfName || speaker === runtimeStrings.systemName) continue;
		return raw.slice(colon + 2);
	}
	return undefined;
}
