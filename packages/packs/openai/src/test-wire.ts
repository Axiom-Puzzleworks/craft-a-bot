import type { ChatRequest } from '@craftabot/core';

/**
 * Canned wire responses — the fixtures behind the error-kind tests
 * (06-LLM-PROVIDERS.md §7). Everything here is shaped like a real OpenAI
 * response so the tests exercise the same parsing path a live call would.
 */

export const CHAT_REQUEST: ChatRequest = {
	model: 'gpt-5-mini',
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

/**
 * A 401 that quotes the key back — what OpenAI *actually* sends, discovered by
 * running the live smoke test with a deliberately wrong key. The original
 * `badKey` fixture below was written by hand and left the key out, which is
 * precisely why the leak survived a supposedly complete error-kind suite.
 */
export function badKeyEchoingBody(key: string): unknown {
	return {
		error: {
			message: `Incorrect API key provided: ${key}. You can find your API key at https://platform.openai.com/account/api-keys.`,
			type: 'invalid_request_error',
			param: null,
			code: 'invalid_api_key'
		}
	};
}

export const ERROR_BODIES = {
	badKey: {
		error: {
			message: 'Incorrect API key provided.',
			type: 'invalid_request_error',
			code: 'invalid_api_key'
		}
	},
	rateLimited: {
		error: {
			message: 'Rate limit reached for requests.',
			type: 'requests',
			code: 'rate_limit_exceeded'
		}
	},
	quota: {
		error: {
			message: 'You exceeded your current quota.',
			type: 'insufficient_quota',
			code: 'insufficient_quota'
		}
	},
	filtered: {
		error: {
			message: 'Your request was rejected by our safety system.',
			type: 'invalid_request_error',
			code: 'content_filter'
		}
	},
	serverError: { error: { message: 'The server had an error.', type: 'server_error', code: null } },
	unknown: { error: { message: 'Something odd.', type: 'weird_error', code: 'weird' } }
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
export function errorFetch(
	status: number,
	body: unknown,
	headers: Record<string, string> = {}
): typeof globalThis.fetch {
	return () =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { 'content-type': 'application/json', ...headers }
			})
		);
}

/** A `fetch` that never gets off the ground. */
export function failingFetch(message = 'Failed to fetch'): typeof globalThis.fetch {
	return () => Promise.reject(new TypeError(message));
}
