import type { ProviderErrorKind } from '@craftabot/core';
import { describe, expect, it, vi } from 'vitest';
import { OpenAiError } from './errors.js';
import { createOpenAIProvider } from './provider.js';
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
 * WP7's definition of done: **all error kinds unit-tested against canned wire
 * fixtures**. Injecting `fetch` is what makes that possible — not one of these
 * touches the network, so the gate stays honest in CI.
 */

const KEY = 'sk-test-not-a-real-key';
const NO_SIGNAL = { signal: new AbortController().signal };

function provider(fetchImpl: typeof globalThis.fetch) {
	return createOpenAIProvider({ apiKey: KEY, fetch: fetchImpl });
}

async function kindOf(fetchImpl: typeof globalThis.fetch): Promise<ProviderErrorKind> {
	try {
		await provider(fetchImpl).chat(CHAT_REQUEST, NO_SIGNAL);
	} catch (error) {
		if (error instanceof OpenAiError) return error.kind;
		throw error;
	}
	throw new Error('expected the call to fail');
}

describe('the error normalisation table (06 §7)', () => {
	it('maps 401 to bad-key', async () => {
		await expect(kindOf(errorFetch(401, ERROR_BODIES.badKey))).resolves.toBe('bad-key');
	});

	it('maps 403 to bad-key too', async () => {
		await expect(kindOf(errorFetch(403, ERROR_BODIES.badKey))).resolves.toBe('bad-key');
	});

	it('maps 429 to rate-limited', async () => {
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
			expect(error).toBeInstanceOf(OpenAiError);
			expect((error as OpenAiError).providerError.retryAfterMs).toBe(30_000);
		}
	});

	it('maps an exhausted quota to quota, not rate-limited, even on a 429', async () => {
		await expect(kindOf(errorFetch(429, ERROR_BODIES.quota))).resolves.toBe('quota');
	});

	it('maps a rejected prompt to filtered', async () => {
		await expect(kindOf(errorFetch(400, ERROR_BODIES.filtered))).resolves.toBe('filtered');
	});

	it('maps a mid-stream refusal to filtered', async () => {
		await expect(kindOf(streamingFetch(streamingFilteredBody()))).resolves.toBe('filtered');
	});

	it('maps a failed fetch to network', async () => {
		await expect(kindOf(failingFetch())).resolves.toBe('network');
	});

	it('maps 5xx to provider-down', async () => {
		await expect(kindOf(errorFetch(503, ERROR_BODIES.serverError))).resolves.toBe('provider-down');
	});

	it('maps an unreadable stream to malformed', async () => {
		await expect(kindOf(streamingFetch(streamingGarbageBody()))).resolves.toBe('malformed');
	});

	it('maps an unrecognised 4xx to malformed', async () => {
		await expect(kindOf(errorFetch(418, ERROR_BODIES.unknown))).resolves.toBe('malformed');
	});

	it('never puts the key in an error message — hard rule 2', async () => {
		try {
			await provider(errorFetch(401, ERROR_BODIES.badKey)).chat(CHAT_REQUEST, NO_SIGNAL);
		} catch (error) {
			expect(JSON.stringify((error as OpenAiError).providerError)).not.toContain(KEY);
			expect((error as OpenAiError).message).not.toContain(KEY);
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

	it('sends the key only in the Authorization header', async () => {
		const seen: RequestInit[] = [];
		const spy: typeof globalThis.fetch = (_url, init) => {
			seen.push(init ?? {});
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat(CHAT_REQUEST, NO_SIGNAL);

		const init = seen[0];
		expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
		expect(String(init?.body)).not.toContain(KEY);
	});

	it('asks for usage in the stream, which OpenAI omits otherwise (06 §4)', async () => {
		let body = '';
		const spy: typeof globalThis.fetch = (_url, init) => {
			body = String(init?.body);
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat(CHAT_REQUEST, NO_SIGNAL);

		expect(JSON.parse(body)).toMatchObject({
			stream: true,
			stream_options: { include_usage: true },
			model: 'gpt-5-mini'
		});
	});

	it('passes tools through in OpenAI function format', async () => {
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
				type: 'function',
				function: {
					name: 'move',
					description: 'Roll one square.',
					parameters: { type: 'object', properties: { direction: { type: 'string' } } }
				}
			}
		]);
	});
});

describe('validateKey — the battery meter ping (06 §6)', () => {
	it('lights the meter on a 200', async () => {
		const result = await provider(errorFetch(200, { data: [] })).validateKey(KEY);
		expect(result.ok).toBe(true);
	});

	it('reports a bad key in plain language', async () => {
		const result = await provider(errorFetch(401, ERROR_BODIES.badKey)).validateKey(KEY);
		expect(result.ok).toBe(false);
		expect(result.message).toContain('Incorrect API key');
	});

	it('calls the cheapest authenticated endpoint there is', async () => {
		const urls: string[] = [];
		const spy: typeof globalThis.fetch = (url) => {
			urls.push(String(url));
			return Promise.resolve(new Response('{"data":[]}', { status: 200 }));
		};
		await provider(spy).validateKey(KEY);
		expect(urls[0]).toBe('https://api.openai.com/v1/models');
	});

	it('caches the result until the key changes', async () => {
		const spy = vi.fn(() => Promise.resolve(new Response('{"data":[]}', { status: 200 })));
		const instance = provider(spy as unknown as typeof globalThis.fetch);

		await instance.validateKey(KEY);
		await instance.validateKey(KEY);
		expect(spy).toHaveBeenCalledTimes(1);

		await instance.validateKey('sk-a-different-key');
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('does not cache a network failure — a blip is not a bad key', async () => {
		let calls = 0;
		const flaky: typeof globalThis.fetch = () => {
			calls += 1;
			return calls === 1
				? Promise.reject(new TypeError('Failed to fetch'))
				: Promise.resolve(new Response('{"data":[]}', { status: 200 }));
		};
		const instance = provider(flaky);

		expect((await instance.validateKey(KEY)).ok).toBe(false);
		expect((await instance.validateKey(KEY)).ok).toBe(true);
	});
});

/**
 * Hard rule 2, tested against what the provider really sends rather than what
 * we assumed it sends.
 *
 * The rest of this file's error-kind coverage was green while the leak below
 * was live, because every fixture was written by hand from the shape of the
 * docs. Only a live call showed that OpenAI repeats the rejected key inside its
 * 401 message. These tests exist so that stays fixed.
 */
describe('the key never escapes the pack', () => {
	const LEAKY_KEY = 'sk-proj-averyrealisticlookingsecret1234567890';

	it('scrubs the key OpenAI quotes back in a 401, on the chat path', async () => {
		const instance = createOpenAIProvider({
			apiKey: LEAKY_KEY,
			fetch: errorFetch(401, badKeyEchoingBody(LEAKY_KEY))
		});

		const error = await instance.chat(CHAT_REQUEST, NO_SIGNAL).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(OpenAiError);
		const thrown = error as OpenAiError;
		expect(thrown.kind).toBe('bad-key');

		// Not just the message: everything that travels to the trace.
		const everything = JSON.stringify({
			message: thrown.message,
			providerError: thrown.providerError
		});
		expect(everything).not.toContain(LEAKY_KEY);
		// Still a useful error, not just a blanked-out one.
		expect(thrown.message).toContain('Incorrect API key provided');
		expect(thrown.message).toContain('[key-redacted]');
	});

	it('scrubs the key on the validateKey path, which is where a bad key shows up', async () => {
		const instance = createOpenAIProvider({
			apiKey: LEAKY_KEY,
			fetch: errorFetch(401, badKeyEchoingBody(LEAKY_KEY))
		});

		const result = await instance.validateKey(LEAKY_KEY);

		expect(result.ok).toBe(false);
		// This string is rendered straight into the battery compartment.
		expect(result.message).not.toContain(LEAKY_KEY);
		expect(result.message).toContain('[key-redacted]');
	});

	it('scrubs the key out of a successful response raw, which lands in the trace', async () => {
		const echoed = `data: ${JSON.stringify({
			choices: [{ delta: { content: `leaked ${LEAKY_KEY} oops` }, finish_reason: 'stop' }]
		})}\n\ndata: [DONE]\n\n`;

		const instance = createOpenAIProvider({
			apiKey: LEAKY_KEY,
			fetch: streamingFetch(echoed)
		});

		const response = await instance.chat(CHAT_REQUEST, NO_SIGNAL);
		expect(JSON.stringify(response.raw)).not.toContain(LEAKY_KEY);
	});

	it('leaves an unrelated error untouched — scrubbing is targeted, not blanket', async () => {
		const instance = createOpenAIProvider({
			apiKey: LEAKY_KEY,
			fetch: errorFetch(500, ERROR_BODIES.serverError)
		});

		const error = (await instance
			.chat(CHAT_REQUEST, NO_SIGNAL)
			.catch((caught: unknown) => caught)) as OpenAiError;

		expect(error.kind).toBe('provider-down');
		expect(error.message).toBe('The server had an error.');
	});
});
