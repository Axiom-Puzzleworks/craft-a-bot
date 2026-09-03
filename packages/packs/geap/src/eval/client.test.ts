import { describe, expect, it } from 'vitest';
import { evalFixtures } from '../fixtures/eval/index.js';
import { createEvalClient, describeEvalEndpoint } from './client.js';

/**
 * The evaluation client (`39-…` §4.1): a regional URL only, the token in
 * the header and nowhere else, and every failure a value.
 */

const TOKEN = 'ya29.secret-token-value';
const config = { projectId: 'proj-1', location: 'europe-west2' };

function fetchAnswering(
	status: number,
	body: unknown,
	seen: { url?: string; init?: RequestInit } = {}
) {
	return (async (url: string | URL | Request, init?: RequestInit) => {
		seen.url = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
		if (init) seen.init = init;
		return new Response(JSON.stringify(body), {
			status,
			headers: { 'content-type': 'application/json' }
		});
	}) as typeof globalThis.fetch;
}

describe('createEvalClient', () => {
	it('posts to the regional evaluateInstances endpoint with the bearer token, and returns the body', async () => {
		const seen: { url?: string; init?: RequestInit } = {};
		const client = createEvalClient({
			...config,
			timeoutMs: 1000,
			fetch: fetchAnswering(200, evalFixtures['safety-safe'], seen),
			token: () => `${TOKEN}\n`
		});
		const result = await client.evaluate({
			safetyInput: { metricSpec: {}, instance: { prediction: 'hi' } }
		});
		expect('response' in result && result.response).toEqual(evalFixtures['safety-safe']);
		expect(seen.url).toBe(
			'https://europe-west2-aiplatform.googleapis.com/v1/projects/proj-1/locations/europe-west2:evaluateInstances'
		);
		expect(seen.url).toBe(describeEvalEndpoint(config));
		expect((seen.init?.headers as Record<string, string>)['authorization']).toBe(`Bearer ${TOKEN}`);
		expect(seen.init?.method).toBe('POST');
	});

	it('never builds a global host', () => {
		expect(describeEvalEndpoint({ projectId: 'p', location: 'us-central1' })).toContain(
			'https://us-central1-aiplatform.googleapis.com/'
		);
		expect(describeEvalEndpoint({ projectId: 'p', location: 'us-central1' })).not.toContain(
			'https://aiplatform.googleapis.com'
		);
	});

	it('maps a refusal onto the closed error kinds with the token scrubbed from the message', async () => {
		const client = createEvalClient({
			...config,
			timeoutMs: 1000,
			fetch: fetchAnswering(403, { error: { message: `no way, ${TOKEN}` } }),
			token: () => TOKEN
		});
		const result = await client.evaluate({});
		expect('error' in result && result.error.kind).toBe('no-permission');
		expect(JSON.stringify(result)).not.toContain(TOKEN);
		expect('error' in result && result.error.message).toContain('[token-redacted]');
	});

	it('turns a rejected fetch and a timeout into values', async () => {
		const failing = createEvalClient({
			...config,
			timeoutMs: 1000,
			fetch: (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof globalThis.fetch,
			token: () => TOKEN
		});
		expect('error' in (await failing.evaluate({})) && (await failing.evaluate({}))).toMatchObject({
			error: { kind: 'unavailable' }
		});
		const slow = createEvalClient({
			...config,
			timeoutMs: 5,
			fetch: ((_url: unknown, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						const error = new Error('aborted');
						error.name = 'AbortError';
						reject(error);
					});
				})) as typeof globalThis.fetch,
			token: () => TOKEN
		});
		expect(await slow.evaluate({})).toMatchObject({ error: { kind: 'timeout' } });
	});

	it('reports a body that is not JSON as unavailable', async () => {
		const client = createEvalClient({
			...config,
			timeoutMs: 1000,
			fetch: (async () => new Response('<html>', { status: 200 })) as typeof globalThis.fetch,
			token: () => TOKEN
		});
		expect(await client.evaluate({})).toMatchObject({ error: { kind: 'unavailable' } });
	});
});
