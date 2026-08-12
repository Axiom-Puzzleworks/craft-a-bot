import type { ChatResponse, KeyCheck, LLMProvider, ProviderError } from '@craftabot/core';
import { OPENAI_BASE_URL, OPENAI_PROVIDER_ID } from './catalogue.js';
import {
	OpenAiError,
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
 * The real brain (06-LLM-PROVIDERS.md §4–5): OpenAI Chat Completions, streamed
 * over SSE, called straight from the browser with the user's own key.
 *
 * `fetch` is injected so every failure path can be driven from a canned
 * response in a unit test — the definition of done asks for all seven error
 * kinds covered, and a provider that could only be tested against the live API
 * would make that impossible to keep true.
 *
 * The key lives in this module's closure and goes exactly one place: the
 * `Authorization` header. It is never logged, never put in an error message,
 * and never reaches an event (hard rule 2).
 *
 * Keeping that last promise takes active work on the way *back*, not just on
 * the way out: OpenAI's 401 body repeats the rejected key inside its message,
 * so every error is passed through `scrubKey` before it leaves this module.
 * This is the last layer that knows the secret, so it is the last chance to
 * remove it.
 */

export interface OpenAiProviderOptions {
	apiKey: string;
	/** Injected for tests; defaults to the platform `fetch`. */
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
}

export function createOpenAIProvider(options: OpenAiProviderOptions): LLMProvider {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const baseUrl = options.baseUrl ?? OPENAI_BASE_URL;

	/** Cached until the key changes (06 §6). */
	let cachedCheck: { key: string; result: KeyCheck } | undefined;

	function authHeaders(key: string): Record<string, string> {
		return { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
	}

	/** The single exit for every failure, so nothing escapes unscrubbed. */
	function fail(error: ProviderError, key: string): never {
		throw new OpenAiError(scrubProviderError(error, key));
	}

	return {
		id: OPENAI_PROVIDER_ID,
		name: 'OpenAI',
		keyRequirement: 'required',

		/** The cheapest authenticated call there is, just to light the battery meter. */
		async validateKey(key) {
			if (cachedCheck?.key === key) return cachedCheck.result;

			let response: Response;
			try {
				response = await doFetch(`${baseUrl}/models`, { headers: authHeaders(key) });
			} catch (cause) {
				// Not cached: a network blip should not condemn a perfectly good key.
				return { ok: false, message: scrubKey(normaliseNetworkError(cause).message, key) };
			}

			// This is the message the battery compartment shows the user, and the
			// one place OpenAI is *most* likely to quote the key back — a wrong key
			// is exactly what this call exists to detect.
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
				response = await doFetch(`${baseUrl}/chat/completions`, {
					method: 'POST',
					headers: authHeaders(options.apiKey),
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

			return readStream(response.body, request, opts.onToken, options.apiKey);
		}
	};
}

async function readStream(
	body: ReadableStream<Uint8Array>,
	request: { model: string },
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
		throw new OpenAiError(
			scrubProviderError(
				normaliseMalformed('The provider streamed nothing we could read.', {
					model: request.model
				}),
				apiKey
			)
		);
	}

	// `raw` is provider-authored content and it lands in the trace, so it gets the
	// same treatment as an error body — belt and braces, but the braces are free.
	const result = accumulator.finish(scrubKey({ chunks: rawChunks }, apiKey));
	// A refusal is reported honestly rather than dressed up as an empty thought.
	if (result.finishReason === 'filtered' && result.text === '' && !result.toolCall) {
		throw new OpenAiError(scrubProviderError(normaliseFiltered(result.raw), apiKey));
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
