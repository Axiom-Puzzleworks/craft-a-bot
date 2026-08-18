import type { ChatRequest } from '@craftabot/core';

/**
 * Canned wire responses — the fixtures behind the error-kind tests
 * (`06-…` §7). Shaped like a real Anthropic Messages API response so the
 * tests exercise the same parsing path a live call would.
 */

export const CHAT_REQUEST: ChatRequest = {
	model: 'claude-sonnet-4-5',
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

const chunk = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

/** A streaming success: text, then a tool call, then usage. */
export function streamingSuccessBody(): string {
	return [
		chunk({ type: 'message_start', message: { usage: { input_tokens: 120 } } }),
		chunk({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
		chunk({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text: 'I should ' }
		}),
		chunk({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text: 'look around.' }
		}),
		chunk({ type: 'content_block_stop', index: 0 }),
		chunk({
			type: 'content_block_start',
			index: 1,
			content_block: { type: 'tool_use', id: 'toolu_1', name: 'move' }
		}),
		chunk({
			type: 'content_block_delta',
			index: 1,
			delta: { type: 'input_json_delta', partial_json: '{"dir' }
		}),
		chunk({
			type: 'content_block_delta',
			index: 1,
			delta: { type: 'input_json_delta', partial_json: 'ection":"north"}' }
		}),
		chunk({ type: 'content_block_stop', index: 1 }),
		chunk({
			type: 'message_delta',
			delta: { stop_reason: 'tool_use' },
			usage: { output_tokens: 18 }
		}),
		chunk({ type: 'message_stop' })
	].join('');
}

/** Text only, no tool call. */
export function streamingTextOnlyBody(): string {
	return [
		chunk({ type: 'content_block_start', index: 0, content_block: { type: 'text' } }),
		chunk({
			type: 'content_block_delta',
			index: 0,
			delta: { type: 'text_delta', text: 'Just thinking.' }
		}),
		chunk({ type: 'content_block_stop', index: 0 }),
		chunk({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} }),
		chunk({ type: 'message_stop' })
	].join('');
}

/** A provider-side refusal, mid-turn. */
export function streamingFilteredBody(): string {
	return [
		chunk({ type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: {} }),
		chunk({ type: 'message_stop' })
	].join('');
}

/** Frames that are not JSON at all. */
export function streamingGarbageBody(): string {
	return 'data: not json\n\ndata: also not json\n\n';
}

/**
 * A 401 that quotes the key back — the same shape `pack-openai`'s own
 * discovery names, applied here defensively rather than proven live (see
 * `errors.ts`'s comment).
 */
export function badKeyEchoingBody(key: string): unknown {
	return {
		type: 'error',
		error: {
			type: 'authentication_error',
			message: `invalid x-api-key ${key}`
		}
	};
}

export const ERROR_BODIES = {
	badKey: { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
	rateLimited: {
		type: 'error',
		error: { type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit.' }
	},
	quota: {
		type: 'error',
		error: {
			type: 'invalid_request_error',
			message: 'Your credit balance is too low to access the Anthropic API.'
		}
	},
	filtered: {
		type: 'error',
		error: { type: 'invalid_request_error', message: 'Output blocked by content filtering policy.' }
	},
	serverError: {
		type: 'error',
		error: { type: 'api_error', message: 'An unexpected error occurred.' }
	},
	overloaded: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
	unknown: { type: 'error', error: { type: 'weird_error', message: 'Something odd.' } }
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
