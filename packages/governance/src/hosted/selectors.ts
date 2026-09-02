import type { EngineEvent, GuardrailContext, GuardrailHook } from '@craftabot/core';

/**
 * **What each hook screens** (`29-GUARD-SHELL.md` §4.4; `25-…` §4.5's
 * reasoning, kept): at `pre-think` the observation — not the composed
 * prompt, whose system and goal sections are the builder's own words and
 * would spend tokens on false positives; at `pre-act` the thought plus the
 * proposed call rendered as `say("…")` / `give(character: teddy, item:
 * snack)`, with the observation as context; at `post-act` the newer of the
 * last narration and the last tool result.
 *
 * Each reads the widened context first (`observation`, `response` — WP39
 * stage A) and falls back to the history walk, which is the same answer on
 * every fixture and the only answer a host that predates the widening can
 * give. A selector that finds nothing returns `undefined`, and the shell
 * makes no call.
 */

export interface Screen {
	text: string;
	/** Extra context the vendor may take beside the text — the observation for a response screen. */
	context?: string;
}

export type TextSelector = (ctx: GuardrailContext) => Screen | undefined;

export function observationText(ctx: GuardrailContext): string | undefined {
	return ctx.observation?.text ?? findLast(ctx.history, 'sense')?.payload.observation.text;
}

export const observationSelector: TextSelector = (ctx) => {
	const text = observationText(ctx);
	return text === undefined ? undefined : { text };
};

export const decisionSelector: TextSelector = (ctx) => {
	if (!ctx.proposed) return undefined;
	const thought = ctx.response?.text ?? findLast(ctx.history, 'decision')?.payload.thought;
	if (thought === undefined) return undefined;
	const text = `${thought}\n${renderCall(ctx.proposed.name, ctx.proposed.arguments)}`;
	const context = observationText(ctx);
	return context !== undefined ? { text, context } : { text };
};

export const resultSelector: TextSelector = (ctx) => {
	for (const event of ctx.history.slice().reverse()) {
		if (event.type === 'action.performed') return { text: event.payload.result.narration };
		if (event.type === 'tool.executed') return { text: stringifyToolResult(event.payload.result) };
	}
	return undefined;
};

export const defaultSelectors: Record<GuardrailHook, TextSelector> = {
	'pre-think': observationSelector,
	'pre-act': decisionSelector,
	'post-act': resultSelector
};

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
export function renderCall(name: string, args: unknown): string {
	if (args === null || args === undefined) return `${name}()`;
	if (typeof args === 'string') return `${name}("${args}")`;
	if (typeof args === 'object') {
		const parts = Object.entries(args as Record<string, unknown>).map(
			([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`
		);
		return `${name}(${parts.join(', ')})`;
	}
	return `${name}(${JSON.stringify(args)})`;
}

export function stringifyToolResult(result: unknown): string {
	if (typeof result === 'string') return result;
	try {
		return JSON.stringify(result);
	} catch {
		return String(result);
	}
}
