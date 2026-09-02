import { describe, expect, it } from 'vitest';
import { EgressRefusedError, createEgressGuard, hostMatches, hostOf } from './egress.js';

describe('hostMatches', () => {
	it('matches exactly, case-insensitively, or with one wildcard label', () => {
		expect(hostMatches('api.openai.com', 'api.openai.com')).toBe(true);
		expect(hostMatches('api.openai.com', 'API.OpenAI.com')).toBe(true);
		expect(
			hostMatches('modelarmor.*.rep.googleapis.com', 'modelarmor.europe-west2.rep.googleapis.com')
		).toBe(true);
		expect(hostMatches('modelarmor.*.rep.googleapis.com', 'modelarmor.rep.googleapis.com')).toBe(
			false
		);
		expect(hostMatches('*.openai.com', 'evil.api.openai.com')).toBe(false);
		expect(hostMatches('api.openai.com', 'api.openai.com.evil.test')).toBe(false);
	});
});

describe('hostOf', () => {
	it('reads the hostname from a string, a URL or a Request, ignoring the port', () => {
		expect(hostOf('http://localhost:11434/v1/chat')).toBe('localhost');
		expect(hostOf(new URL('https://api.openai.com/v1/models'))).toBe('api.openai.com');
		expect(hostOf(new Request('https://api.anthropic.com/v1/messages'))).toBe('api.anthropic.com');
		expect(hostOf('not a url')).toBe('not a url');
	});
});

describe('createEgressGuard', () => {
	const calls: string[] = [];
	const upstream: typeof fetch = (input) => {
		calls.push(hostOf(input));
		return Promise.resolve(new Response('ok'));
	};

	it('under declared, allows exactly the declared hosts and refuses the rest with an event first', async () => {
		const refused: EgressRefusedError[] = [];
		const guard = createEgressGuard({
			mode: 'declared',
			fetch: upstream,
			onRefused: (e) => refused.push(e)
		});
		guard.allow([{ host: 'api.openai.com', purpose: 'LLM completions', sends: ['prompt'] }]);
		guard.allow([
			{ host: 'modelarmor.*.rep.googleapis.com', purpose: 'content screening', sends: ['decision'] }
		]);

		await expect(guard.fetch('https://api.openai.com/v1/chat/completions')).resolves.toBeInstanceOf(
			Response
		);
		await expect(
			guard.fetch('https://modelarmor.europe-west2.rep.googleapis.com/v1/x')
		).resolves.toBeInstanceOf(Response);
		await expect(guard.fetch('https://evil.example.test/exfil')).rejects.toMatchObject({
			name: 'EgressRefusedError',
			kind: 'egress-refused',
			host: 'evil.example.test',
			mode: 'declared'
		});
		expect(refused.map((e) => e.message)).toEqual([
			'Refused a call to "evil.example.test": no fitted component declared it (egress: declared).'
		]);
		expect(calls).toEqual(['api.openai.com', 'modelarmor.europe-west2.rep.googleapis.com']);
		expect(guard.hosts()).toEqual(['api.openai.com', 'modelarmor.*.rep.googleapis.com']);
	});

	it('under none, refuses everything — declared or not — and never calls upstream', async () => {
		const before = calls.length;
		const guard = createEgressGuard({ mode: 'none', fetch: upstream });
		guard.allow([{ host: 'api.openai.com', purpose: 'LLM completions', sends: ['prompt'] }]);
		await expect(guard.fetch('https://api.openai.com/v1/models')).rejects.toThrow(
			'Refused a call to "api.openai.com": this run allows no network at all (egress: none).'
		);
		expect(calls.length).toBe(before);
	});
});
