import type { ChatRequest, ChatResponse, KeyCheck, LLMProvider } from '../types/provider.js';

/**
 * The mock provider (05-TECH-STACK.md §2, §4): a fully deterministic
 * `LLMProvider` with scripted responses. It exists from the first milestone
 * because everything except the real OpenAI call must be testable offline, and
 * it doubles as the keyless brain behind `npm run demo`.
 */

export interface MockTurn {
	/** The bot's thought. Streamed word by word through `onToken`. */
	text: string;
	toolCall?: { name: string; arguments: unknown } | null;
	finishReason?: ChatResponse['finishReason'];
	usage?: { inputTokens: number; outputTokens: number };
}

/** A script is either a fixed list of turns or a function of the request. */
export type MockScript = MockTurn[] | ((request: ChatRequest, turnIndex: number) => MockTurn);

export interface MockProviderOptions {
	script: MockScript;
	id?: string;
	name?: string;
	/** What to do once a fixed script runs out. Defaults to an idle shrug. */
	whenExhausted?: MockTurn;
}

const SHRUG: MockTurn = { text: 'I am not sure what to do next.', toolCall: null };

export function createMockProvider(options: MockProviderOptions): LLMProvider {
	let turnIndex = 0;

	return {
		id: options.id ?? 'mock',
		name: options.name ?? 'Mock brain',
		keyRequirement: 'none',
		validateKey(): Promise<KeyCheck> {
			return Promise.resolve({ ok: true, message: 'No battery needed for the mock brain.' });
		},
		async chat(request, opts): Promise<ChatResponse> {
			const turn = nextTurn(options, request, turnIndex);
			turnIndex += 1;

			// Streaming is real, not simulated after the fact: the session's
			// `think.token` events come from these callbacks.
			if (opts.onToken && turn.text !== '') {
				for (const chunk of turn.text.split(/(?<=\s)/)) {
					if (opts.signal.aborted) break;
					opts.onToken(chunk);
				}
			}
			if (opts.signal.aborted) {
				throw new Error('The request was aborted.');
			}

			const toolCall = turn.toolCall ?? null;
			return {
				text: turn.text,
				toolCall,
				usage: turn.usage ?? estimateUsage(request, turn),
				raw: { mock: true, turnIndex: turnIndex - 1, turn },
				finishReason: turn.finishReason ?? (toolCall ? 'tool_call' : 'stop')
			};
		}
	};
}

function nextTurn(options: MockProviderOptions, request: ChatRequest, index: number): MockTurn {
	if (typeof options.script === 'function') return options.script(request, index);
	return options.script[index] ?? options.whenExhausted ?? SHRUG;
}

/** Rough but stable, so token budgets and meters have something honest to show. */
function estimateUsage(request: ChatRequest, turn: MockTurn) {
	const inputCharacters = request.messages.reduce((total, m) => total + m.content.length, 0);
	return {
		inputTokens: Math.ceil(inputCharacters / 4),
		outputTokens: Math.ceil(turn.text.length / 4)
	};
}

// ── The three scripted personas (09-ROADMAP.md WP3) ────────────────────────

/** Convenience: a turn that thinks out loud and calls one action or tool. */
export function turn(text: string, name: string, args: unknown = {}): MockTurn {
	return { text, toolCall: { name, arguments: args } };
}

/**
 * **Obedient** — follows a supplied plan, then shrugs. The plan is a list of
 * calls; the persona narrates each one so the thought bubble has something to
 * show. This is what the end-to-end goal tests drive.
 */
export function obedient(plan: Array<{ say: string; call: string; args?: unknown }>): MockScript {
	const turns = plan.map((stepPlan) => turn(stepPlan.say, stepPlan.call, stepPlan.args ?? {}));
	return turns;
}

/**
 * **Wanderer** — moves in a fixed cycle without regard for the goal. The
 * no-memory teaching moment: it looks busy and achieves nothing.
 */
export function wanderer(): MockScript {
	const directions = ['north', 'east', 'south', 'west'] as const;
	return (_request, index) => {
		// Cast: `index % length` is always in range, but noUncheckedIndexedAccess
		// cannot see that, and a fallback branch here would be unreachable code.
		const direction = directions[index % directions.length] as (typeof directions)[number];
		return turn(`Let me try going ${direction}.`, 'move', { direction });
	};
}

/**
 * **Mumbling** — returns nothing usable, exercising the malformed-output
 * re-prompt rule (03-UI-UX-DESIGN.md §9). Pass `recoverAfter` to have it pull
 * itself together on a later turn.
 */
export function mumbling(recoverAfter = Number.POSITIVE_INFINITY): MockScript {
	return (_request, index) => {
		if (index >= recoverAfter)
			return turn('Sorry — let me try that again.', 'say', { text: 'Hello!' });
		return { text: '   ', toolCall: null };
	};
}
