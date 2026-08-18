import type { ChatResponse, KeyCheck, LLMProvider, ProviderError } from '@craftabot/core';
import { GEMINI_BASE_URL, GEMINI_PROVIDER_ID } from './catalogue.js';
import {
	GeminiError,
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
 * The real brain, Gemini's `streamGenerateContent` (`06-…` §4–5).
 *
 * **The key goes in the `x-goog-api-key` header, never in the URL.** Google's
 * own docs default to `?key=API_KEY` as a query parameter — that is a hard
 * rule 2 violation the moment it happens (keys never in logs, and a URL with
 * a key in it turns up in browser history, referrer headers and any request
 * log this app does not control). The header form is documented and
 * equivalent; this pack only ever uses that one.
 *
 * `alt=sse` is a query parameter too, but it names a response *format*, not
 * a secret — asking for it in the URL is what makes `streamGenerateContent`
 * answer with real Server-Sent Events instead of one large streamed JSON
 * array, which would need an entirely different parser.
 *
 * `fetch` is injected so every failure path can be driven from a canned
 * response in a unit test, same discipline as the other two provider packs.
 */

export interface GeminiProviderOptions {
	apiKey: string;
	/** Injected for tests; defaults to the platform `fetch`. */
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
}

export function createGeminiProvider(options: GeminiProviderOptions): LLMProvider {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const baseUrl = options.baseUrl ?? GEMINI_BASE_URL;

	/** Cached until the key changes (06 §6). */
	let cachedCheck: { key: string; result: KeyCheck } | undefined;

	function headers(key: string): Record<string, string> {
		return { 'x-goog-api-key': key, 'content-type': 'application/json' };
	}

	function fail(error: ProviderError, key: string): never {
		throw new GeminiError(scrubProviderError(error, key));
	}

	return {
		id: GEMINI_PROVIDER_ID,
		name: 'Gemini',
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
			const body = buildRequestBody(request);

			let response: Response;
			try {
				response = await doFetch(
					`${baseUrl}/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`,
					{
						method: 'POST',
						headers: headers(options.apiKey),
						body: JSON.stringify(body),
						signal: opts.signal
					}
				);
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
		throw new GeminiError(
			scrubProviderError(
				normaliseMalformed('The provider streamed nothing we could read.', null),
				apiKey
			)
		);
	}

	const result = accumulator.finish(scrubKey({ chunks: rawChunks }, apiKey));
	// A refusal is reported honestly rather than dressed up as an empty thought.
	if (result.finishReason === 'filtered' && result.text === '' && !result.toolCall) {
		throw new GeminiError(scrubProviderError(normaliseFiltered(result.raw), apiKey));
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
