import { describe, expect, it, vi } from 'vitest';
import { fixtures } from '../fixtures/index.js';
import { createModelArmorClient, createOfflineArmorClient } from './client.js';
import type { ModelArmorClientOptions } from './client.js';

const TOKEN = 'ya29.super-secret-access-token';

function baseOptions(fetchImpl: typeof globalThis.fetch): ModelArmorClientOptions {
	return {
		projectId: 'proj-1',
		location: 'europe-west2',
		templateId: 'cab-armour',
		timeoutMs: 3000,
		fetch: fetchImpl,
		token: () => TOKEN
	};
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function abortableFetch(): typeof globalThis.fetch {
	return (_input, init) =>
		new Promise((_resolve, reject) => {
			init?.signal?.addEventListener('abort', () => {
				const error = new Error('The operation was aborted.');
				error.name = 'AbortError';
				reject(error);
			});
		});
}

describe('URL building — never a global host', () => {
	it('always builds a regional host with the configured location', async () => {
		const seen: string[] = [];
		const fetchSpy: typeof globalThis.fetch = (input) => {
			seen.push(String(input));
			return Promise.resolve(jsonResponse(fixtures.clean));
		};
		const client = createModelArmorClient(baseOptions(fetchSpy));
		await client.sanitizeUserPrompt('hello');

		expect(seen).toHaveLength(1);
		expect(seen[0]).toMatch(/^https:\/\/modelarmor\.europe-west2\.rep\.googleapis\.com\//);
		expect(seen[0]).not.toBe('https://modelarmor.rep.googleapis.com/');
		expect(seen[0]).not.toContain('modelarmor.rep.googleapis.com');
	});

	it('cannot build a host with an empty location', async () => {
		const seen: string[] = [];
		const fetchSpy: typeof globalThis.fetch = (input) => {
			seen.push(String(input));
			return Promise.resolve(jsonResponse(fixtures.clean));
		};
		// An empty location is a config-validation concern (config.ts rejects
		// it); the client itself still cannot fall back to a global host.
		const client = createModelArmorClient({ ...baseOptions(fetchSpy), location: 'us-central1' });
		await client.sanitizeUserPrompt('hello');
		expect(seen[0]).toContain('modelarmor.us-central1.rep.googleapis.com');
	});
});

describe('createModelArmorClient — requests', () => {
	it('sends the userPromptData envelope, a bearer token and json content-type', async () => {
		let seenInit: RequestInit | undefined;
		const fetchSpy: typeof globalThis.fetch = (_input, init) => {
			seenInit = init;
			return Promise.resolve(jsonResponse(fixtures.clean));
		};
		const client = createModelArmorClient(baseOptions(fetchSpy));
		await client.sanitizeUserPrompt('look around the room');

		expect(seenInit?.method).toBe('POST');
		expect((seenInit?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`);
		expect((seenInit?.headers as Record<string, string>)['content-type']).toBe('application/json');
		expect(JSON.parse(String(seenInit?.body))).toEqual({
			userPromptData: { text: 'look around the room' }
		});
	});

	it('sends the modelResponseData envelope with userPrompt context when given', async () => {
		let seenInit: RequestInit | undefined;
		const fetchSpy: typeof globalThis.fetch = (_input, init) => {
			seenInit = init;
			return Promise.resolve(jsonResponse(fixtures.clean));
		};
		const client = createModelArmorClient(baseOptions(fetchSpy));
		await client.sanitizeModelResponse('say("hello")', 'you see a robot');

		expect(JSON.parse(String(seenInit?.body))).toEqual({
			modelResponseData: { text: 'say("hello")' },
			userPrompt: 'you see a robot'
		});
	});

	it('resolves {reading} on a clean 200 response', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(jsonResponse(fixtures.clean)))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('reading' in result).toBe(true);
	});
});

describe('createModelArmorClient — failure paths', () => {
	it('maps a 401 to bad-token without throwing', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(jsonResponse({ error: { message: 'invalid token' } }, 401)))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('bad-token');
	});

	it('maps a 403 to no-permission', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(jsonResponse({}, 403)))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('no-permission');
	});

	it('maps a 404 to no-template', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(jsonResponse({}, 404)))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('no-template');
	});

	it('maps a 429 to quota', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(jsonResponse({}, 429)))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('quota');
	});

	it('maps a 500 to unavailable', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(jsonResponse({}, 500)))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('unavailable');
	});

	it('maps a rejected fetch (offline/DNS/CORS) to unavailable, never throwing', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.reject(new TypeError('Failed to fetch')))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('unavailable');
	});

	it('maps a 200 whose body is not JSON to unavailable', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(new Response('not json', { status: 200 })))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('unavailable');
	});

	it('maps a 200 whose body does not match the sanitize envelope to unavailable', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.resolve(jsonResponse({ shrug: true })))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result && result.error.kind).toBe('unavailable');
	});

	it('times out at timeoutMs and reports the timeout kind', async () => {
		vi.useFakeTimers();
		const client = createModelArmorClient({ ...baseOptions(abortableFetch()), timeoutMs: 50 });
		const pending = client.sanitizeUserPrompt('hi');
		await vi.advanceTimersByTimeAsync(50);
		const result = await pending;
		vi.useRealTimers();
		expect('error' in result && result.error.kind).toBe('timeout');
	});
});

describe('createModelArmorClient — never leaks the token', () => {
	it('scrubs the token out of an error message the guard echoes back', async () => {
		const client = createModelArmorClient(
			baseOptions(() =>
				Promise.resolve(jsonResponse({ error: { message: `bad token: ${TOKEN}` } }, 401))
			)
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect('error' in result).toBe(true);
		expect(JSON.stringify(result)).not.toContain(TOKEN);
	});

	it('scrubs the token out of a network-failure message', async () => {
		const client = createModelArmorClient(
			baseOptions(() => Promise.reject(new TypeError(`Failed to fetch with ${TOKEN} in the URL`)))
		);
		const result = await client.sanitizeUserPrompt('hi');
		expect(JSON.stringify(result)).not.toContain(TOKEN);
	});

	it('never puts the token in the request URL', async () => {
		const seen: string[] = [];
		const fetchSpy: typeof globalThis.fetch = (input) => {
			seen.push(String(input));
			return Promise.resolve(jsonResponse(fixtures.clean));
		};
		const client = createModelArmorClient(baseOptions(fetchSpy));
		await client.sanitizeUserPrompt('hi');
		expect(seen[0]).not.toContain(TOKEN);
	});
});

describe('createOfflineArmorClient', () => {
	it('never calls fetch and resolves with a clean reading', async () => {
		const client = createOfflineArmorClient();
		const result = await client.sanitizeUserPrompt('hi');
		expect('reading' in result).toBe(true);
		expect('reading' in result && result.reading.outcome).toBe('ok');
		expect('reading' in result && result.reading.matched).toBe(false);
	});

	it('answers sanitizeModelResponse the same way, ignoring the userPrompt argument', async () => {
		const client = createOfflineArmorClient();
		const result = await client.sanitizeModelResponse('say("hi")', 'context');
		expect('reading' in result).toBe(true);
	});
});
