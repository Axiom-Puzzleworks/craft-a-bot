import type { ChatRequest } from '@craftabot/core';

/**
 * Canned wire responses — the fixtures behind the error-kind tests
 * (`06-…` §7). Shaped like a real Gemini `generateContent` response so the
 * tests exercise the same parsing path a live call would.
 */

export const CHAT_REQUEST: ChatRequest = {
	model: 'gemini-2.5-flash',
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

/** A streaming success: text, then a whole (non-streamed) tool call, then usage. */
export function streamingSuccessBody(): string {
	return [
		chunk({ candidates: [{ content: { parts: [{ text: 'I should ' }] } }] }),
		chunk({ candidates: [{ content: { parts: [{ text: 'look around.' }] } }] }),
		chunk({
			candidates: [
				{
					content: { parts: [{ functionCall: { name: 'move', args: { direction: 'north' } } }] },
					finishReason: 'STOP'
				}
			],
			usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 18 }
		})
	].join('');
}

/** Text only, no tool call. */
export function streamingTextOnlyBody(): string {
	return [
		chunk({
			candidates: [{ content: { parts: [{ text: 'Just thinking.' }] }, finishReason: 'STOP' }]
		})
	].join('');
}

/** A provider-side safety block. */
export function streamingFilteredBody(): string {
	return [chunk({ candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }] })].join('');
}

/** Frames that are not JSON at all. */
export function streamingGarbageBody(): string {
	return 'data: not json\n\ndata: also not json\n\n';
}

/**
 * A 401 that quotes the key back — the same defensive shape the other two
 * provider packs carry (see `pack-anthropic/errors.ts`'s comment).
 */
export function badKeyEchoingBody(key: string): unknown {
	return { error: { code: 401, message: `API key not valid: ${key}`, status: 'UNAUTHENTICATED' } };
}

export const ERROR_BODIES = {
	badKey: { error: { code: 401, message: 'API key not valid.', status: 'UNAUTHENTICATED' } },
	rateLimited: {
		error: { code: 429, message: 'Resource has been exhausted.', status: 'RESOURCE_EXHAUSTED' }
	},
	quota: {
		error: {
			code: 429,
			message: 'You exceeded your current quota, please check your plan and billing details.',
			status: 'RESOURCE_EXHAUSTED'
		}
	},
	serverError: { error: { code: 500, message: 'Internal error.', status: 'INTERNAL' } },
	unavailable: { error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } },
	unknown: { error: { code: 418, message: 'Something odd.', status: 'WEIRD' } }
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
