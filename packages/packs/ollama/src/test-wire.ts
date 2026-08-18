import type { ChatRequest } from '@craftabot/core';

/**
 * Canned wire responses — shaped exactly like OpenAI's, since that is what
 * Ollama's `/v1/chat/completions` genuinely sends.
 */

export const CHAT_REQUEST: ChatRequest = {
	model: 'llama3.2',
	messages: [
		{ role: 'system', content: 'You are a small robot in a simulated playroom.' },
		{ role: 'user', content: 'Right now:\nYou look around: nothing but rug.' }
	],
	tools: [
		{
			name: 'move',
			description: 'Roll one square.',
			parameters: { type: 'object', properties: { direction: { type: 'string' } } }
		}
	],
	temperature: 0.7,
	maxTokens: 300
};

/** A streaming success: a few text deltas, a tool call, then usage and [DONE]. */
export function streamingSuccessBody(): string {
	const chunk = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
	return [
		chunk({ choices: [{ delta: { content: 'I should ' } }] }),
		chunk({ choices: [{ delta: { content: 'look around.' } }] }),
		chunk({
			choices: [
				{ delta: { tool_calls: [{ index: 0, function: { name: 'move', arguments: '{"dir' } }] } }
			]
		}),
		chunk({
			choices: [
				{
					delta: { tool_calls: [{ index: 0, function: { arguments: 'ection":"north"}' } }] },
					finish_reason: 'tool_calls'
				}
			]
		}),
		chunk({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 18 } }),
		'data: [DONE]\n\n'
	].join('');
}

/** Text only, no tool call. */
export function streamingTextOnlyBody(): string {
	return [
		`data: ${JSON.stringify({ choices: [{ delta: { content: 'Just thinking.' } }] })}\n\n`,
		`data: ${JSON.stringify({ choices: [{ finish_reason: 'stop' }] })}\n\n`,
		'data: [DONE]\n\n'
	].join('');
}

/** A provider-side refusal. */
export function streamingFilteredBody(): string {
	return [
		`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'content_filter' }] })}\n\n`,
		'data: [DONE]\n\n'
	].join('');
}

/** Frames that are not JSON at all. */
export function streamingGarbageBody(): string {
	return 'data: not json\n\ndata: also not json\n\ndata: [DONE]\n\n';
}

export const ERROR_BODIES = {
	modelNotFound: { error: { message: 'model "llama3.2" not found, try pulling it first' } },
	serverError: { error: { message: 'internal server error' } },
	unknown: { error: { message: 'something odd' } }
} as const;

/** A `fetch` that answers with a streamed body. */
export function streamingFetch(body: string, status = 200): typeof globalThis.fetch {
	return () =>
		Promise.resolve(
			new Response(new TextEncoder().encode(body), {
				status,
				headers: { 'content-type': 'text/event-stream' }
			})
		);
}

/** A `fetch` that answers with a JSON error. */
export function errorFetch(status: number, body: unknown): typeof globalThis.fetch {
	return () =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json' }
			})
		);
}

/** A `fetch` that never gets off the ground — the everyday "Ollama is not running" case. */
export function failingFetch(message = 'Failed to fetch'): typeof globalThis.fetch {
	return () => Promise.reject(new TypeError(message));
}
