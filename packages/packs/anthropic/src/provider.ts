import type { ChatResponse, KeyCheck, LLMProvider, ProviderError } from '@craftabot/core';
import { ANTHROPIC_BASE_URL, ANTHROPIC_PROVIDER_ID, ANTHROPIC_VERSION } from './catalogue.js';
import {
	AnthropicError,
	normaliseFiltered,
	normaliseHttpError,
	normaliseMalformed,
	normaliseNetworkError,
	scrubKey,
	scrubProviderError
} from './errors.js';
import { createSseParser } from './sse.js';
import { buildRequestBody, createStreamAccumulator, streamChunkSchema } from './wire.js';

/**
 * The real brain, Anthropic's Messages API, streamed over SSE (`06-…` §4–5).
 *
 * `anthropic-dangerous-direct-browser-access: true` is required for a direct
 * browser call at all — without it Anthropic answers a CORS-shaped rejection
 * regardless of what the browser itself allows, which `06-…` §5 already
 * names as the header this pack would need.
 *
 * `fetch` is injected so every failure path can be driven from a canned
 * response in a unit test, same discipline as `pack-openai/provider.ts`.
 *
 * The key lives in this module's closure and goes exactly one place: the
 * `x-api-key` header. Every error is passed through `scrubKey` before it
 * leaves this module, on the same reasoning `pack-openai`'s own comment
 * gives — the last layer that knows the secret is the last chance to
 * remove it, whether or not this provider has been caught doing the same
 * thing OpenAI's 401 body does.
 */

export interface AnthropicProviderOptions {
	apiKey: string;
	/** Injected for tests; defaults to the platform `fetch`. */
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
}

export function createAnthropicProvider(options: AnthropicProviderOptions): LLMProvider {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const baseUrl = options.baseUrl ?? ANTHROPIC_BASE_URL;

	/** Cached until the key changes (06 §6). */
	let cachedCheck: { key: string; result: KeyCheck } | undefined;

	function headers(key: string): Record<string, string> {
		return {
			'x-api-key': key,
			'anthropic-version': ANTHROPIC_VERSION,
			'anthropic-dangerous-direct-browser-access': 'true',
			'content-type': 'application/json'
		};
	}

	function fail(error: ProviderError, key: string): never {
		throw new AnthropicError(scrubProviderError(error, key));
	}

	return {
		id: ANTHROPIC_PROVIDER_ID,
		name: 'Anthropic',
		keyRequirement: 'required',

		/** The cheapest authenticated call there is, just to light the battery meter. */
		async validateKey(key) {
			if (cachedCheck?.key === key) return cachedCheck.result;

			let response: Response;
			try {
				response = await doFetch(`${baseUrl}/models`, { headers: headers(key) });
			} catch (cause) {
				// Not cached: a network blip should not condemn a perfectly good key.
				return { ok: false, message: scrubKey(normaliseNetworkError(cause).message, key) };
			}

			const result: KeyCheck = response.ok
				? { ok: true, message: 'Battery charged — this key works.' }
				: {
						ok: false,
						message: scrubKey(
							normaliseHttpError(response.status, await safeJson(response), response.headers)
								.message,
							key
						)
					};
			cachedCheck = { key, result };
			return result;
		},

		async chat(request, opts): Promise<ChatResponse> {
			const body = buildRequestBody(request, request.model);

			let response: Response;
			try {
				response = await doFetch(`${baseUrl}/messages`, {
					method: 'POST',
					headers: headers(options.apiKey),
					body: JSON.stringify(body),
					signal: opts.signal
				});
			} catch (cause) {
				fail(normaliseNetworkError(cause), options.apiKey);
			}

			if (!response.ok) {
				fail(
					normaliseHttpError(response.status, await safeJson(response), response.headers),
					options.apiKey
				);
			}
			if (!response.body) {
				fail(normaliseMalformed('The provider sent no response body.', null), options.apiKey);
			}

			return readStream(response.body, opts.onToken, options.apiKey);
		}
	};
}

async function readStream(
	body: ReadableStream<Uint8Array>,
	onToken: ((token: string) => void) | undefined,
	apiKey: string
): Promise<ChatResponse> {
	const parser = createSseParser();
	const accumulator = createStreamAccumulator();
	const decoder = new TextDecoder();
	const reader = body.getReader();
	const rawChunks: unknown[] = [];
	let sawAnyChunk = false;

	try {
		for (;;) {
			const { done, value } = await reader.read();
			const frames = done ? parser.flush() : parser.push(decoder.decode(value, { stream: true }));

			for (const frame of frames) {
				const parsed = streamChunkSchema.safeParse(safeParseJson(frame.data));
				if (!parsed.success) continue; // A frame we do not understand is not fatal.
				sawAnyChunk = true;
				rawChunks.push(parsed.data);
				const { textDelta } = accumulator.add(parsed.data);
				if (textDelta && onToken) onToken(textDelta);
			}
			if (done) break;
		}
	} finally {
		reader.releaseLock();
	}

	if (!sawAnyChunk) {
		throw new AnthropicError(
			scrubProviderError(
				normaliseMalformed('The provider streamed nothing we could read.', null),
				apiKey
			)
		);
	}

	const result = accumulator.finish(scrubKey({ chunks: rawChunks }, apiKey));
	// A refusal is reported honestly rather than dressed up as an empty thought.
	if (result.finishReason === 'filtered' && result.text === '' && !result.toolCall) {
		throw new AnthropicError(scrubProviderError(normaliseFiltered(result.raw), apiKey));
	}
	return result;
}

async function safeJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}

function safeParseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}
