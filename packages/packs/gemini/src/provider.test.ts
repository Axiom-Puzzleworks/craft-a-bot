import type { ProviderErrorKind } from '@craftabot/core';
import { describe, expect, it, vi } from 'vitest';
import { GeminiError } from './errors.js';
import { createGeminiProvider } from './provider.js';
import {
	badKeyEchoingBody,
	CHAT_REQUEST,
	ERROR_BODIES,
	errorFetch,
	failingFetch,
	streamingFetch,
	streamingFilteredBody,
	streamingGarbageBody,
	streamingSuccessBody,
	streamingTextOnlyBody
} from './test-wire.js';

/**
 * All error kinds unit-tested against canned wire fixtures, the same
 * discipline the other two provider packs use — injecting `fetch` means none
 * of this touches the network.
 */

const KEY = 'AIzaSyTestNotARealKey';
const NO_SIGNAL = { signal: new AbortController().signal };

function provider(fetchImpl: typeof globalThis.fetch) {
	return createGeminiProvider({ apiKey: KEY, fetch: fetchImpl });
}

async function kindOf(fetchImpl: typeof globalThis.fetch): Promise<ProviderErrorKind> {
	try {
		await provider(fetchImpl).chat(CHAT_REQUEST, NO_SIGNAL);
	} catch (error) {
		if (error instanceof GeminiError) return error.kind;
		throw error;
	}
	throw new Error('expected the call to fail');
}

describe('the error normalisation table (06 §7)', () => {
	it('maps 401/UNAUTHENTICATED to bad-key', async () => {
		await expect(kindOf(errorFetch(401, ERROR_BODIES.badKey))).resolves.toBe('bad-key');
	});

	it('maps RESOURCE_EXHAUSTED to rate-limited', async () => {
		await expect(kindOf(errorFetch(429, ERROR_BODIES.rateLimited))).resolves.toBe('rate-limited');
	});

	it('reads retry-after off a 429, so the UI can count down', async () => {
		try {
			await provider(errorFetch(429, ERROR_BODIES.rateLimited, { 'retry-after': '30' })).chat(
				CHAT_REQUEST,
				NO_SIGNAL
			);
			throw new Error('expected a failure');
		} catch (error) {
			expect(error).toBeInstanceOf(GeminiError);
			expect((error as GeminiError).providerError.retryAfterMs).toBe(30_000);
		}
	});

	it('maps a RESOURCE_EXHAUSTED that mentions quota/billing to quota, not rate-limited', async () => {
		await expect(kindOf(errorFetch(429, ERROR_BODIES.quota))).resolves.toBe('quota');
	});

	it('maps a mid-stream safety block to filtered', async () => {
		await expect(kindOf(streamingFetch(streamingFilteredBody()))).resolves.toBe('filtered');
	});

	it('maps a failed fetch to network', async () => {
		await expect(kindOf(failingFetch())).resolves.toBe('network');
	});

	it('maps INTERNAL/5xx to provider-down', async () => {
		await expect(kindOf(errorFetch(500, ERROR_BODIES.serverError))).resolves.toBe('provider-down');
	});

	it('maps UNAVAILABLE to provider-down', async () => {
		await expect(kindOf(errorFetch(503, ERROR_BODIES.unavailable))).resolves.toBe('provider-down');
	});

	it('maps an unreadable stream to malformed', async () => {
		await expect(kindOf(streamingFetch(streamingGarbageBody()))).resolves.toBe('malformed');
	});

	it('maps an unrecognised status to malformed', async () => {
		await expect(kindOf(errorFetch(418, ERROR_BODIES.unknown))).resolves.toBe('malformed');
	});

	it('never puts the key in an error message — hard rule 2', async () => {
		try {
			await provider(errorFetch(401, ERROR_BODIES.badKey)).chat(CHAT_REQUEST, NO_SIGNAL);
		} catch (error) {
			expect(JSON.stringify((error as GeminiError).providerError)).not.toContain(KEY);
			expect((error as GeminiError).message).not.toContain(KEY);
		}
	});
});

describe('streaming a successful completion', () => {
	it('assembles text, the tool call, and usage', async () => {
		const response = await provider(streamingFetch(streamingSuccessBody())).chat(
			CHAT_REQUEST,
			NO_SIGNAL
		);

		expect(response.text).toBe('I should look around.');
		expect(response.toolCall).toEqual({ name: 'move', arguments: { direction: 'north' } });
		expect(response.usage).toEqual({ inputTokens: 120, outputTokens: 18 });
		expect(response.finishReason).toBe('tool_call');
	});

	it('emits each text delta through onToken, in order', async () => {
		const tokens: string[] = [];
		await provider(streamingFetch(streamingSuccessBody())).chat(CHAT_REQUEST, {
			...NO_SIGNAL,
			onToken: (token) => tokens.push(token)
		});

		expect(tokens).toEqual(['I should ', 'look around.']);
	});

	it('handles a plain thought with no tool call', async () => {
		const response = await provider(streamingFetch(streamingTextOnlyBody())).chat(
			CHAT_REQUEST,
			NO_SIGNAL
		);
		expect(response.text).toBe('Just thinking.');
		expect(response.toolCall).toBeNull();
		expect(response.finishReason).toBe('stop');
	});

	it('keeps the raw chunks for the trace', async () => {
		const response = await provider(streamingFetch(streamingSuccessBody())).chat(
			CHAT_REQUEST,
			NO_SIGNAL
		);
		expect(response.raw).toMatchObject({ chunks: expect.any(Array) });
	});

	it('sends the key only in x-goog-api-key — never in the URL (hard rule 2)', async () => {
		const seen: { url: string; init: RequestInit }[] = [];
		const spy: typeof globalThis.fetch = (url, init) => {
			seen.push({ url: String(url), init: init ?? {} });
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat(CHAT_REQUEST, NO_SIGNAL);

		const { url, init } = seen[0]!;
		expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
		expect(url).not.toContain(KEY);
		expect(String(init.body)).not.toContain(KEY);
	});

	it('asks for alt=sse, or the response would not be real Server-Sent Events', async () => {
		let url = '';
		const spy: typeof globalThis.fetch = (requestUrl) => {
			url = String(requestUrl);
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat(CHAT_REQUEST, NO_SIGNAL);
		expect(url).toContain('alt=sse');
		expect(url).toContain(':streamGenerateContent');
	});

	it('passes tools through as Gemini function declarations', async () => {
		let body = '';
		const spy: typeof globalThis.fetch = (_url, init) => {
			body = String(init?.body);
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat(CHAT_REQUEST, NO_SIGNAL);

		expect(JSON.parse(body).tools).toEqual([
			{
				functionDeclarations: [
					{
						name: 'move',
						description: 'Roll one square.',
						parameters: { type: 'object', properties: { direction: { type: 'string' } } }
					}
				]
			}
		]);
	});
});

describe('validateKey — the battery meter ping (06 §6)', () => {
	it('lights the meter on a 200', async () => {
		const result = await provider(errorFetch(200, { models: [] })).validateKey(KEY);
		expect(result.ok).toBe(true);
	});

	it('reports a bad key in plain language', async () => {
		const result = await provider(errorFetch(401, ERROR_BODIES.badKey)).validateKey(KEY);
		expect(result.ok).toBe(false);
		expect(result.message).toContain('API key not valid');
	});

	it('calls the cheapest authenticated endpoint there is, with the key in the header not the URL', async () => {
		const seen: { url: string; init: RequestInit }[] = [];
		const spy: typeof globalThis.fetch = (url, init) => {
			seen.push({ url: String(url), init: init ?? {} });
			return Promise.resolve(new Response('{"models":[]}', { status: 200 }));
		};
		await provider(spy).validateKey(KEY);
		expect(seen[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models');
		expect((seen[0]?.init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
	});

	it('caches the result until the key changes', async () => {
		const spy = vi.fn(() => Promise.resolve(new Response('{"models":[]}', { status: 200 })));
		const instance = provider(spy as unknown as typeof globalThis.fetch);

		await instance.validateKey(KEY);
		await instance.validateKey(KEY);
		expect(spy).toHaveBeenCalledTimes(1);

		await instance.validateKey('AIzaSyADifferentKey');
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('does not cache a network failure — a blip is not a bad key', async () => {
		let calls = 0;
		const flaky: typeof globalThis.fetch = () => {
			calls += 1;
			return calls === 1
				? Promise.reject(new TypeError('Failed to fetch'))
				: Promise.resolve(new Response('{"models":[]}', { status: 200 }));
		};
		const instance = provider(flaky);

		expect((await instance.validateKey(KEY)).ok).toBe(false);
		expect((await instance.validateKey(KEY)).ok).toBe(true);
	});
});

describe('the key never escapes the pack', () => {
	const LEAKY_KEY = 'AIzaSyAveryrealisticlookingsecret1234567890';

	it('scrubs the key if Gemini ever quotes it back in a 401, on the chat path', async () => {
		const instance = createGeminiProvider({
			apiKey: LEAKY_KEY,
			fetch: errorFetch(401, badKeyEchoingBody(LEAKY_KEY))
		});

		const error = await instance.chat(CHAT_REQUEST, NO_SIGNAL).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(GeminiError);
		const thrown = error as GeminiError;
		expect(thrown.kind).toBe('bad-key');

		const everything = JSON.stringify({
			message: thrown.message,
			providerError: thrown.providerError
		});
		expect(everything).not.toContain(LEAKY_KEY);
		expect(thrown.message).toContain('[key-redacted]');
	});

	it('scrubs the key on the validateKey path, which is where a bad key shows up', async () => {
		const instance = createGeminiProvider({
			apiKey: LEAKY_KEY,
			fetch: errorFetch(401, badKeyEchoingBody(LEAKY_KEY))
		});

		const result = await instance.validateKey(LEAKY_KEY);

		expect(result.ok).toBe(false);
		expect(result.message).not.toContain(LEAKY_KEY);
		expect(result.message).toContain('[key-redacted]');
	});

	it('scrubs the key out of a successful response raw, which lands in the trace', async () => {
		const echoed = `data: ${JSON.stringify({
			candidates: [
				{ content: { parts: [{ text: `leaked ${LEAKY_KEY} oops` }] }, finishReason: 'STOP' }
			]
		})}\n\n`;

		const instance = createGeminiProvider({ apiKey: LEAKY_KEY, fetch: streamingFetch(echoed) });

		const response = await instance.chat(CHAT_REQUEST, NO_SIGNAL);
		expect(JSON.stringify(response.raw)).not.toContain(LEAKY_KEY);
	});

	it('leaves an unrelated error untouched — scrubbing is targeted, not blanket', async () => {
		const instance = createGeminiProvider({
			apiKey: LEAKY_KEY,
			fetch: errorFetch(500, ERROR_BODIES.serverError)
		});

		const error = (await instance
			.chat(CHAT_REQUEST, NO_SIGNAL)
			.catch((caught: unknown) => caught)) as GeminiError;

		expect(error.kind).toBe('provider-down');
		expect(error.message).toBe('Internal error.');
	});
});
