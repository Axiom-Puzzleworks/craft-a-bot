import { describe, expect, it } from 'vitest';
import type { GuardrailContext, ScreenRequest } from '@craftabot/core';
import { describeConformance } from '@craftabot/pack-testkit';
import { fixtures } from './fixtures/index.js';
import pack from './index.js';
import {
	createLakeraClient,
	guardResponseSchema,
	lakeraGuardService,
	scrubKey,
	toScreenReading,
	validateLakeraKey
} from './service.js';

/**
 * Lakera Guard on the shell (WP99): the reading maps the breakdown to the
 * shell's categories; the client sends the bearer header and scrubs the key
 * from every error; the service answers offline from its fixtures; the
 * conformance kit's service and component checks pass; the connection is
 * declared harness-only with the checkpoint pending.
 */
const KEY = 'lakera-planted-key-0123456789';
const request = (overrides: Partial<ScreenRequest> = {}): ScreenRequest => ({
	hook: 'pre-act',
	text: 'hello',
	envelope: { agentId: 'a', tick: 1 },
	...overrides
});

function fetchFrom(answer: unknown, status = 200) {
	const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
	const fetchImpl: typeof fetch = (input, init) => {
		calls.push({
			url: String(input),
			body: JSON.parse(String(init?.body)),
			auth: new Headers(init?.headers).get('authorization')
		});
		return Promise.resolve(new Response(JSON.stringify(answer), { status }));
	};
	return { fetchImpl, calls };
}

describe('the reading', () => {
	it('maps prompt attacks to injection, PII to sensitive data, moderation to harmful, links to malicious-link', () => {
		const reading = toScreenReading(guardResponseSchema.parse(fixtures['prompt-attack']));
		expect(reading.matched).toBe(true);
		expect(reading.findings).toEqual([
			{
				category: 'injection',
				vendorLabel: 'prompt_attack',
				ran: true,
				matched: true,
				confidence: 'high'
			},
			{ category: 'sensitive-data', vendorLabel: 'pii/credit_card', ran: true, matched: false }
		]);
		expect(toScreenReading(guardResponseSchema.parse(fixtures.pii)).findings[1]).toMatchObject({
			category: 'sensitive-data',
			matched: true
		});
		const clean = toScreenReading(guardResponseSchema.parse(fixtures.clean));
		expect(clean.matched).toBe(false);
		expect(clean.findings.map((finding) => finding.category)).toEqual([
			'injection',
			'sensitive-data',
			'harmful'
		]);
		// Flagged with no row: a match on the vendor's word, labelled as such.
		const bare = toScreenReading(guardResponseSchema.parse(fixtures['flagged-no-breakdown']));
		expect(bare.matched).toBe(true);
		expect(bare.findings).toEqual([
			{ category: 'other', vendorLabel: 'flagged', ran: true, matched: true }
		]);
	});
});

describe('the client', () => {
	it('posts the text as a user message with the bearer header, to /v2/guard', async () => {
		const { fetchImpl, calls } = fetchFrom(fixtures.clean);
		const client = createLakeraClient({
			endpoint: 'https://api.lakera.ai',
			fetch: fetchImpl,
			key: () => KEY
		});
		const result = await client.guard('hello');
		expect('body' in result && result.body.flagged).toBe(false);
		expect(calls[0]).toMatchObject({
			url: 'https://api.lakera.ai/v2/guard',
			auth: `Bearer ${KEY}`,
			body: { messages: [{ role: 'user', content: 'hello' }] }
		});
	});

	it('maps a 401 to bad-token with the key scrubbed, and a rejecting fetch to unavailable', async () => {
		const denied = fetchFrom({ message: `Invalid key ${KEY}` }, 401);
		const client = createLakeraClient({
			endpoint: 'https://api.lakera.ai',
			fetch: denied.fetchImpl,
			key: () => KEY
		});
		const result = await client.guard('hello');
		expect('error' in result && result.error.kind).toBe('bad-token');
		expect(JSON.stringify(result)).not.toContain(KEY);
		const down = createLakeraClient({
			endpoint: 'https://api.lakera.ai',
			fetch: () => Promise.reject(new Error(`boom ${KEY}`)),
			key: () => KEY
		});
		const failed = await down.guard('hello');
		expect('error' in failed && failed.error.kind).toBe('unavailable');
		expect(JSON.stringify(failed)).not.toContain(KEY);
		expect(scrubKey(`x ${KEY} y`, KEY)).toBe('x [key-redacted] y');
	});
});

describe('the service', () => {
	it('is harness-only with the checkpoint pending, declares one host, and its component says so', () => {
		expect(lakeraGuardService.browserCapable).toBe(false);
		expect(lakeraGuardService.egress.map((e) => e.host)).toEqual(['api.lakera.ai']);
		const component = pack.guardrailComponents?.[0];
		expect(component?.connection).toMatchObject({
			kind: 'hosted',
			wraps: 'lakera/guard',
			browserCapable: 'checkpoint-pending',
			standIn: 'offline-fixture',
			version: 'v2'
		});
	});

	it('offline: serves the fixture the config names, clean by default', async () => {
		const clean = await lakeraGuardService.createOffline({}).screen(request());
		expect('reading' in clean && clean.reading.matched).toBe(false);
		const attack = await lakeraGuardService
			.createOffline({ offlineFixture: 'prompt-attack' })
			.screen(request());
		expect('reading' in attack && attack.reading.matched).toBe(true);
		expect(attack.record.service).toBe('lakera-guard');
	});

	it('"Test the guard" asks about the known attack', async () => {
		expect((await validateLakeraKey(KEY, fetchFrom(fixtures['prompt-attack']).fetchImpl)).ok).toBe(
			true
		);
		expect((await validateLakeraKey(KEY, fetchFrom(fixtures.clean).fetchImpl)).ok).toBe(false);
		expect((await validateLakeraKey('', fetchFrom(fixtures.clean).fetchImpl)).ok).toBe(false);
		expect(
			(await validateLakeraKey(KEY, fetchFrom(fixtures.unauthorized, 401).fetchImpl)).message
		).toContain('could not check');
	});
});

const componentContext = (hook: 'pre-think' | 'pre-act' | 'post-act'): GuardrailContext => ({
	hook,
	tick: 1,
	spec: { id: 'probe', name: 'probe', goalCardId: '', schemaVersion: 1 } as never,
	usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
	worldState: {},
	history: []
});

describeConformance({
	manifest: pack,
	guardrailComponents: {
		[lakeraGuardService.id]: {
			config: {
				serviceConfig: {},
				screening: {
					offline: true,
					screenObservation: 'note',
					screenDecision: 'note',
					screenResult: 'note'
				}
			},
			verdicts: [{ verdict: 'allow', context: componentContext('pre-think') }]
		}
	},
	guardrailServices: {
		[lakeraGuardService.id]: {
			config: {},
			requests: (['pre-think', 'pre-act', 'post-act'] as const).map((hook) => request({ hook })),
			plantedSecret: KEY
		}
	}
});
