import { describe, expect, it } from 'vitest';
import type { ScreenRequest } from '@craftabot/core';
import { describeConformance } from '@craftabot/pack-testkit';
import {
	createOpaClient,
	decisionPathSchema,
	describeDecisionEndpoint,
	opaUrlSchema
} from './client.js';
import { fixtures } from './fixtures/index.js';
import pack from './index.js';
import { findingsFor, readDecision } from './reading.js';
import { opaConfigSchema, opaService } from './service.js';

const policyInput = {
	version: 1,
	hook: 'pre-act',
	tick: 3,
	agent: { id: 'a', name: 'Testbot', goalCardId: 'starter/say-hello' },
	proposed: { kind: 'action', name: 'say', arguments: { text: 'the code is 7734' } },
	usage: { ticks: 3, inputTokens: 0, outputTokens: 0 },
	world: { predicates: { 'said-hello-near-teddy': false } }
};

const request = (overrides: Partial<ScreenRequest> = {}): ScreenRequest => ({
	hook: 'pre-act',
	text: 'say("the code is 7734")',
	envelope: { agentId: 'a', tick: 3 },
	policyInput,
	...overrides
});

function fetchFrom(answer: { body?: unknown; status?: number; throws?: Error }) {
	const calls: Array<{ url: string; body: unknown }> = [];
	const fetchImpl: typeof fetch = (input, init) => {
		if (answer.throws) return Promise.reject(answer.throws);
		calls.push({ url: String(input), body: JSON.parse(String(init?.body)) });
		return Promise.resolve(
			new Response(JSON.stringify(answer.body ?? {}), { status: answer.status ?? 200 })
		);
	};
	return { fetchImpl, calls };
}

describe('the reading', () => {
	it('a deny is one policy-violation finding per violation, named by policy', () => {
		const read = readDecision(fixtures.deny);
		if ('error' in read) throw new Error(read.error.message);
		expect(read.reading).toEqual({
			outcome: 'ok',
			matched: true,
			findings: [
				{
					category: 'policy-violation',
					vendorLabel: 'craftabot.no_secrets_out_loud',
					ran: true,
					matched: true
				}
			]
		});
	});

	it('an allow is one unmatched finding, so the reading is never empty', () => {
		const read = readDecision(fixtures.allow);
		if ('error' in read) throw new Error(read.error.message);
		expect(read.reading.matched).toBe(false);
		expect(read.reading.findings).toEqual([
			{ category: 'policy-violation', vendorLabel: 'allow', ran: true, matched: false }
		]);
		// A deny with no named violation still matches.
		expect(findingsFor({ allow: false, violations: [] })[0]?.matched).toBe(true);
	});

	it('an undefined document is no-template, and a wrong shape is unavailable', () => {
		expect(readDecision(fixtures.undefined)).toMatchObject({ error: { kind: 'no-template' } });
		expect(readDecision({ result: { yes: true } })).toMatchObject({
			error: { kind: 'unavailable' }
		});
		expect(readDecision('nope')).toMatchObject({ error: { kind: 'unavailable' } });
	});
});

describe('the client', () => {
	it('posts { input } to /v1/data/<path> on the local engine and reads the body back', async () => {
		const { fetchImpl, calls } = fetchFrom({ body: fixtures.deny });
		const client = createOpaClient({
			url: 'http://localhost:8181/',
			decisionPath: 'craftabot/decision',
			fetch: fetchImpl
		});
		const answer = await client.decide(policyInput);
		expect(calls).toEqual([
			{ url: 'http://localhost:8181/v1/data/craftabot/decision', body: { input: policyInput } }
		]);
		expect(answer).toEqual({ body: fixtures.deny });
	});

	it('names the failure kinds: unreachable, timeout, a 404 path, a bad body', async () => {
		const at = (fetchImpl: typeof fetch) =>
			createOpaClient({ url: 'http://localhost:8181', decisionPath: 'x', fetch: fetchImpl });
		expect(
			await at(fetchFrom({ throws: new TypeError('refused') }).fetchImpl).decide({})
		).toMatchObject({
			error: { kind: 'unavailable' }
		});
		const aborted = new Error('aborted');
		aborted.name = 'AbortError';
		expect(await at(fetchFrom({ throws: aborted }).fetchImpl).decide({})).toMatchObject({
			error: { kind: 'timeout' }
		});
		expect(
			await at(fetchFrom({ status: 404, body: { message: 'no such path' } }).fetchImpl).decide({})
		).toEqual({ error: { kind: 'no-template', message: 'no such path' } });
		const broken: typeof fetch = () => Promise.resolve(new Response('not json', { status: 200 }));
		expect(await at(broken).decide({})).toMatchObject({ error: { kind: 'unavailable' } });
	});

	it('keeps the engine on this machine', () => {
		expect(opaUrlSchema.safeParse('http://localhost:8181').success).toBe(true);
		expect(opaUrlSchema.safeParse('http://127.0.0.1:8181/').success).toBe(true);
		expect(opaUrlSchema.safeParse('https://opa.example.com').success).toBe(false);
		expect(decisionPathSchema.safeParse('craftabot/decision').success).toBe(true);
		expect(decisionPathSchema.safeParse('../secrets').success).toBe(false);
		expect(describeDecisionEndpoint('http://localhost:8181/', 'a/b')).toBe(
			'http://localhost:8181/v1/data/a/b'
		);
	});
});

describe('the service', () => {
	it('screens the policy input and returns the decision with a record naming the path', async () => {
		const { fetchImpl } = fetchFrom({ body: fixtures.deny });
		const client = opaService.create({
			config: {},
			fetch: fetchImpl,
			getCredential: () => undefined,
			timeoutMs: 1000
		});
		const result = await client.screen(request());
		expect(result.record).toEqual({
			service: 'opa',
			method: 'v1/data',
			endpoint: 'http://localhost:8181/v1/data/craftabot/decision',
			policyRef: 'craftabot/decision'
		});
		expect('reading' in result && result.reading.matched).toBe(true);
	});

	it('refuses a request with no policy input rather than guessing', async () => {
		const client = opaService.createOffline({});
		const result = await client.screen(request({ policyInput: undefined }));
		expect(result).toMatchObject({ error: { kind: 'unavailable' } });
	});

	it('offline answers the configured fixture', async () => {
		const deny = await opaService.createOffline({ fixture: 'deny' }).screen(request());
		expect('reading' in deny && deny.reading.matched).toBe(true);
		const allow = await opaService.createOffline({}).screen(request());
		expect('reading' in allow && allow.reading.matched).toBe(false);
		const none = await opaService.createOffline({ fixture: 'undefined' }).screen(request());
		expect(none).toMatchObject({ error: { kind: 'no-template' } });
		expect(opaConfigSchema.parse({})).toEqual({
			url: 'http://localhost:8181',
			decisionPath: 'craftabot/decision',
			fixture: 'allow'
		});
	});
});

describeConformance({
	manifest: pack,
	guardrailServices: {
		[opaService.id]: {
			config: {},
			requests: [request()],
			plantedSecret: 'planted-secret-that-nothing-should-carry'
		}
	}
});
