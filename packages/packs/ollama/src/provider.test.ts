import type { ProviderErrorKind } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { OllamaError } from './errors.js';
import { createOllamaProvider } from './provider.js';
import {
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

const NO_SIGNAL = { signal: new AbortController().signal };

function provider(fetchImpl: typeof globalThis.fetch) {
	return createOllamaProvider({ fetch: fetchImpl });
}

async function kindOf(fetchImpl: typeof globalThis.fetch): Promise<ProviderErrorKind> {
	try {
		await provider(fetchImpl).chat(CHAT_REQUEST, NO_SIGNAL);
	} catch (error) {
		if (error instanceof OllamaError) return error.kind;
		throw error;
	}
	throw new Error('expected the call to fail');
}

describe('the error normalisation table (06 §7), Ollama’s own everyday failures', () => {
	it('turns a model-not-pulled 404 into an instruction to pull it, not a bare "not found"', async () => {
		try {
			await provider(errorFetch(404, ERROR_BODIES.modelNotFound)).chat(CHAT_REQUEST, NO_SIGNAL);
			throw new Error('expected a failure');
		} catch (error) {
			expect(error).toBeInstanceOf(OllamaError);
			expect((error as OllamaError).message).toContain(`ollama pull ${CHAT_REQUEST.model}`);
		}
	});

	it('turns a failed fetch into "is it running?", not a generic network message', async () => {
		try {
			await provider(failingFetch()).chat(CHAT_REQUEST, NO_SIGNAL);
			throw new Error('expected a failure');
		} catch (error) {
			expect(error).toBeInstanceOf(OllamaError);
			expect((error as OllamaError).kind).toBe('network');
			expect((error as OllamaError).message).toContain('Is it running on this computer?');
		}
	});

	it('maps a mid-stream refusal to filtered', async () => {
		await expect(kindOf(streamingFetch(streamingFilteredBody()))).resolves.toBe('filtered');
	});

	it('maps 5xx to provider-down', async () => {
		await expect(kindOf(errorFetch(500, ERROR_BODIES.serverError))).resolves.toBe('provider-down');
	});

	it('maps an unreadable stream to malformed', async () => {
		await expect(kindOf(streamingFetch(streamingGarbageBody()))).resolves.toBe('malformed');
	});

	it('maps an unrecognised 4xx to malformed', async () => {
		await expect(kindOf(errorFetch(418, ERROR_BODIES.unknown))).resolves.toBe('malformed');
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

	it('sends no Authorization header at all — there is no key', async () => {
		const seen: RequestInit[] = [];
		const spy: typeof globalThis.fetch = (_url, init) => {
			seen.push(init ?? {});
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat(CHAT_REQUEST, NO_SIGNAL);

		const headers = (seen[0]?.headers ?? {}) as Record<string, string>;
		expect('authorization' in headers).toBe(false);
		expect('Authorization' in headers).toBe(false);
	});

	it('sends the full temperature the cartridge asked for, with no GPT-5-style omission', async () => {
		let body = '';
		const spy: typeof globalThis.fetch = (_url, init) => {
			body = String(init?.body);
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat({ ...CHAT_REQUEST, temperature: 1.6 }, NO_SIGNAL);
		expect(JSON.parse(body).temperature).toBe(1.6);
	});

	it('posts to the OpenAI-compatible endpoint on localhost, not Ollama’s own /api/chat', async () => {
		let url = '';
		const spy: typeof globalThis.fetch = (requestUrl) => {
			url = String(requestUrl);
			return Promise.resolve(
				new Response(new TextEncoder().encode(streamingTextOnlyBody()), { status: 200 })
			);
		};
		await provider(spy).chat(CHAT_REQUEST, NO_SIGNAL);
		expect(url).toBe('http://localhost:11434/v1/chat/completions');
	});
});

describe('validateKey — a reachability ping, not a real key check', () => {
	it('says so plainly when the server answers', async () => {
		const result = await provider(errorFetch(200, { data: [] })).validateKey('');
		expect(result.ok).toBe(true);
		expect(result.message).toContain('running');
	});

	it('gives the "is it running?" message when nothing answers', async () => {
		const result = await provider(failingFetch()).validateKey('');
		expect(result.ok).toBe(false);
		expect(result.message).toContain('Is it running on this computer?');
	});
});
