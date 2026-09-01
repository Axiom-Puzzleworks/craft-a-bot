import type { EngineEvent, GuardrailContext } from '@craftabot/core';

/**
 * What each screen sends (`25-…` §4.5), read purely from `ctx.history` (the
 * live trace view) and `ctx.proposed` — never mutated, never retained past
 * one `check()` call (E9).
 *
 * A selector that finds nothing to screen returns `undefined`; the
 * guardrail factory (`guardrails.ts`) turns that into `{allow:true, note:
 * "nothing to check"}` without making a network call.
 */

/** `pre-think`: the last `sense` event's `observation.text` — not the composed prompt (§4.5's own reasoning: the builder's own system/goal words would spend tokens on false positives). */
export function observationText(history: ReadonlyArray<EngineEvent>): string | undefined {
	const sense = findLast(history, 'sense');
	return sense?.payload.observation.text;
}

export interface DecisionScreen {
	text: string;
	userPrompt?: string;
}

/** `pre-act`: the last `decision`'s thought plus the proposed call, with the last observation as `userPrompt` context. */
export function decisionText(
	history: ReadonlyArray<EngineEvent>,
	proposed: GuardrailContext['proposed']
): DecisionScreen | undefined {
	if (!proposed) return undefined;
	const decision = findLast(history, 'decision');
	if (!decision) return undefined;

	const text = `${decision.payload.thought}\n${renderCall(proposed.name, proposed.arguments)}`;
	const userPrompt = observationText(history);
	return userPrompt !== undefined ? { text, userPrompt } : { text };
}

/** `post-act`: the newer of the last `action.performed`'s narration and the last `tool.executed`'s stringified result. */
export function resultText(history: ReadonlyArray<EngineEvent>): string | undefined {
	for (let i = history.length - 1; i >= 0; i -= 1) {
		const event = history[i];
		if (event === undefined) continue;
		if (event.type === 'action.performed') return event.payload.result.narration;
		if (event.type === 'tool.executed') return stringifyToolResult(event.payload.result);
	}
	return undefined;
}

function findLast<T extends EngineEvent['type']>(
	history: ReadonlyArray<EngineEvent>,
	type: T
): Extract<EngineEvent, { type: T }> | undefined {
	for (let i = history.length - 1; i >= 0; i -= 1) {
		const event = history[i];
		if (event?.type === type) return event as Extract<EngineEvent, { type: T }>;
	}
	return undefined;
}

/** `say("go north")` for a single string argument; `give(character: teddy, item: snack)` for an object of them. */
function renderCall(name: string, args: unknown): string {
	if (args === null || args === undefined) return `${name}()`;
	if (typeof args === 'string') return `${name}("${args}")`;
	if (typeof args === 'object') {
		const parts = Object.entries(args as Record<string, unknown>).map(
			([key, value]) => `${key}: ${renderArgValue(value)}`
		);
		return `${name}(${parts.join(', ')})`;
	}
	return `${name}(${JSON.stringify(args)})`;
}

function renderArgValue(value: unknown): string {
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function stringifyToolResult(result: unknown): string {
	if (typeof result === 'string') return result;
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
}
