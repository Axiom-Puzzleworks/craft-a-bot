import { describe, expect, it } from 'vitest';
import { OLLAMA_BASE_URL } from './catalogue.js';
import { describeEndpointProblem, isLoopbackEndpoint } from './endpoint.js';
import ollamaPack from './index.js';

/** The one endpoint rule (WP52, `40-DEBTS.md` §4.3): loopback by hostname, or the default. */
describe('isLoopbackEndpoint', () => {
	it('accepts localhost and 127.0.0.1 over http or https, on any port and path', () => {
		expect(isLoopbackEndpoint('http://localhost:11434/v1')).toBe(true);
		expect(isLoopbackEndpoint('http://127.0.0.1:11434/v1')).toBe(true);
		expect(isLoopbackEndpoint('https://localhost:8443/')).toBe(true);
		expect(isLoopbackEndpoint('  http://localhost:11434/v1  ')).toBe(true);
	});

	it('refuses anywhere else, non-web schemes and non-addresses, saying which', () => {
		expect(describeEndpointProblem('http://ollama.example.com/v1')).toContain('Only this computer');
		expect(describeEndpointProblem('http://[::1]:11434/v1')).toContain('Only this computer');
		expect(describeEndpointProblem('http://localhost.evil.example/v1')).toContain(
			'Only this computer'
		);
		expect(describeEndpointProblem('ftp://localhost/v1')).toContain('http://');
		expect(describeEndpointProblem('not a url')).toContain('not a web address');
		expect(isLoopbackEndpoint('http://10.0.0.5:11434')).toBe(false);
	});
});

describe('the factory and an endpoint', () => {
	function providerCalling(endpoint?: string) {
		const seen: string[] = [];
		const fetch = (async (url: string | URL | Request) => {
			seen.push(String(url));
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		}) as typeof globalThis.fetch;
		const factory = ollamaPack.providers![0]!;
		return {
			provider: factory.create({
				apiKey: '',
				fetch,
				...(endpoint !== undefined ? { endpoint } : {})
			}),
			seen
		};
	}

	it('calls a loopback endpoint it is handed, and the default otherwise', async () => {
		const custom = providerCalling('http://127.0.0.1:11435/v1');
		await custom.provider.validateKey('');
		expect(custom.seen[0]).toBe('http://127.0.0.1:11435/v1/models');

		const plain = providerCalling();
		await plain.provider.validateKey('');
		expect(plain.seen[0]).toBe(`${OLLAMA_BASE_URL}/models`);
	});

	it('ignores an endpoint that is not loopback, even when handed one directly', async () => {
		const { provider, seen } = providerCalling('http://ollama.example.com/v1');
		await provider.validateKey('');
		expect(seen[0]).toBe(`${OLLAMA_BASE_URL}/models`);
	});
});
