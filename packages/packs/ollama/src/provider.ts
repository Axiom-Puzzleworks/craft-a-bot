import type { ChatResponse, KeyCheck, LLMProvider, ProviderError } from '@craftabot/core';
import { OLLAMA_BASE_URL, OLLAMA_PROVIDER_ID } from './catalogue.js';
import {
	OllamaError,
	normaliseFiltered,
	normaliseHttpError,
	normaliseMalformed,
	normaliseNetworkError,
	scrubProviderError
} from './errors.js';
import { createSseParser } from './sse.js';
import { buildRequestBody, createStreamAccumulator, streamChunkSchema } from './wire.js';

/**
 * The real brain, run entirely on the builder's own computer (`06-…` §4–5).
 *
 * **No `Authorization` header at all** — `keyRequirement: 'none'` means
 * there is no key to send, and Ollama's local server does not ask for one
 * by default. `apiKey` still appears on `OllamaProviderOptions`, optional and
 * unused, only so this pack's options shape matches its three siblings'.
 *
 * `fetch` is injected for tests, same discipline as the other three packs —
 * here it matters even more, since a real call needs an actual Ollama
 * server running locally that CI obviously does not have.
 */

export interface OllamaProviderOptions {
	/** Accepted for interface parity with the other provider packs; unused. */
	apiKey?: string;
	fetch?: typeof globalThis.fetch;
	baseUrl?: string;
}

export function createOllamaProvider(options: OllamaProviderOptions = {}): LLMProvider {
	const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	const baseUrl = options.baseUrl ?? OLLAMA_BASE_URL;

	function fail(error: ProviderError): never {
		throw new OllamaError(scrubProviderError(error, ''));
	}

	return {
		id: OLLAMA_PROVIDER_ID,
		name: 'Ollama',
		keyRequirement: 'none',

		/**
		 * Not wired to any UI today — Settings only renders a battery
		 * compartment for `keyRequirement: 'required'` providers, and a
		 * keyless one gets none. Implemented anyway, both for interface
		 * completeness and because "is the local server even reachable" is
		 * exactly the check a future "test connection" affordance would want.
		 */
		async validateKey() {
			try {
				const response = await doFetch(`${baseUrl}/models`);
				const result: KeyCheck = response.ok
					? { ok: true, message: 'Ollama is running and reachable.' }
					: {
							ok: false,
							message: normaliseHttpError(response.status, await safeJson(response), '(any model)')
								.message
						};
				return result;
			} catch (cause) {
				return { ok: false, message: normaliseNetworkError(cause, baseUrl).message };
			}
		},

		async chat(request, opts): Promise<ChatResponse> {
			const body = buildRequestBody(request, request.model);

			let response: Response;
			try {
				response = await doFetch(`${baseUrl}/chat/completions`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body),
					signal: opts.signal
				});
			} catch (cause) {
				fail(normaliseNetworkError(cause, baseUrl));
			}

			if (!response.ok) {
				fail(normaliseHttpError(response.status, await safeJson(response), request.model));
			}
			if (!response.body) {
				fail(normaliseMalformed('The provider sent no response body.', null));
			}

			return readStream(response.body, opts.onToken);
		}
	};
}

async function readStream(
	body: ReadableStream<Uint8Array>,
	onToken: ((token: string) => void) | undefined
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
		throw new OllamaError(
			scrubProviderError(
				normaliseMalformed('The provider streamed nothing we could read.', null),
				''
			)
		);
	}

	const result = accumulator.finish({ chunks: rawChunks });
	if (result.finishReason === 'filtered' && result.text === '' && !result.toolCall) {
		throw new OllamaError(scrubProviderError(normaliseFiltered(result.raw), ''));
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
