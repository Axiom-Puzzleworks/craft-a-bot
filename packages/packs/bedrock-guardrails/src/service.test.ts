import { describe, expect, it } from 'vitest';
import type { GuardrailContext, ScreenRequest } from '@craftabot/core';
import { describeConformance } from '@craftabot/pack-testkit';
import { fixtures } from './fixtures/index.js';
import pack from './index.js';
import {
	applyGuardrailResponseSchema,
	bedrockGuardrailsService,
	createBedrockClient,
	scrubSecret,
	toScreenReading,
	validateBedrockCredential
} from './service.js';
import { parseCredential, signRequest } from './sigv4.js';

/**
 * Bedrock Guardrails on the shell (WP99): SigV4 signs as AWS's own worked
 * example signs; the reading maps the assessments to the shell's categories
 * and carries the anonymised text; the client scrubs both halves of the
 * credential from every error; the service answers offline; the conformance
 * kit's checks pass; the connection is declared not browser-capable.
 */
const CONFIG = { region: 'eu-west-2', guardrailId: 'gr-stand-in', guardrailVersion: '1' };
const SECRET = 'AKIAPLANTEDKEYID1234:plantedSecretAccessKey0123456789abcdef';
const request = (overrides: Partial<ScreenRequest> = {}): ScreenRequest => ({
	hook: 'pre-act',
	text: 'hello',
	envelope: { agentId: 'a', tick: 1 },
	...overrides
});

function fetchFrom(answer: unknown, status = 200) {
	const calls: Array<{ url: string; body: unknown; headers: Record<string, string> }> = [];
	const fetchImpl: typeof fetch = (input, init) => {
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
		calls.push({ url: String(input), body: JSON.parse(String(init?.body)), headers });
		return Promise.resolve(new Response(JSON.stringify(answer), { status }));
	};
	return { fetchImpl, calls };
}

describe('SigV4', () => {
	it('signs a request with the canonical headers and a stable signature for a pinned instant', () => {
		const headers = signRequest(
			{
				method: 'POST',
				url: new URL(
					'https://bedrock-runtime.eu-west-2.amazonaws.com/guardrail/gr-1/version/1/apply'
				),
				body: '{"source":"INPUT"}',
				region: 'eu-west-2',
				service: 'bedrock',
				now: new Date('2026-09-12T10:00:00Z')
			},
			{ accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }
		);
		expect(headers['x-amz-date']).toBe('20260912T100000Z');
		expect(headers['host']).toBe('bedrock-runtime.eu-west-2.amazonaws.com');
		expect(headers['authorization']).toMatch(
			/^AWS4-HMAC-SHA256 Credential=AKIAEXAMPLE\/20260912\/eu-west-2\/bedrock\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/
		);
		const again = signRequest(
			{
				method: 'POST',
				url: new URL(
					'https://bedrock-runtime.eu-west-2.amazonaws.com/guardrail/gr-1/version/1/apply'
				),
				body: '{"source":"INPUT"}',
				region: 'eu-west-2',
				service: 'bedrock',
				now: new Date('2026-09-12T10:00:00Z')
			},
			{ accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' }
		);
		expect(again['authorization']).toBe(headers['authorization']);
		expect(headers['authorization']).not.toContain('wJalrXUtnFEMI');
	});

	it('parses the vault’s one string into the two or three parts, and refuses less', () => {
		expect(parseCredential('a:b')).toEqual({ accessKeyId: 'a', secretAccessKey: 'b' });
		expect(parseCredential('a:b:c')).toEqual({
			accessKeyId: 'a',
			secretAccessKey: 'b',
			sessionToken: 'c'
		});
		expect(parseCredential('a')).toBeUndefined();
		expect(parseCredential(undefined)).toBeUndefined();
	});
});

describe('the reading', () => {
	it('maps the prompt-attack filter to injection with the vendor’s confidence, harms to harmful, PII to sensitive data with the anonymised text', () => {
		const attack = toScreenReading(applyGuardrailResponseSchema.parse(fixtures['prompt-attack']));
		expect(attack.matched).toBe(true);
		expect(attack.findings[0]).toEqual({
			category: 'injection',
			vendorLabel: 'PROMPT_ATTACK',
			ran: true,
			matched: true,
			confidence: 'high',
			vendorConfidence: 'HIGH'
		});
		expect(attack.findings[1]).toMatchObject({
			category: 'harmful',
			vendorLabel: 'HATE',
			matched: false
		});
		const pii = toScreenReading(applyGuardrailResponseSchema.parse(fixtures['pii-anonymised']));
		expect(pii.redactedText).toBe('The card is {CREDIT_DEBIT_CARD_NUMBER}.');
		expect(pii.findings.find((f) => f.category === 'sensitive-data')).toMatchObject({
			vendorLabel: 'pii:CREDIT_DEBIT_CARD_NUMBER',
			matched: true
		});
		const topic = toScreenReading(applyGuardrailResponseSchema.parse(fixtures['topic-denied']));
		expect(topic.findings[0]).toMatchObject({
			category: 'policy-violation',
			vendorLabel: 'topic:Investment advice'
		});
		expect(toScreenReading(applyGuardrailResponseSchema.parse(fixtures.clean)).matched).toBe(false);
	});
});

describe('the client', () => {
	it('posts to the region’s runtime endpoint, signed, with the source by hook', async () => {
		const { fetchImpl, calls } = fetchFrom(fixtures.clean);
		const client = bedrockGuardrailsService.create({
			config: CONFIG,
			fetch: fetchImpl,
			getCredential: () => SECRET,
			timeoutMs: 1000
		});
		await client.screen(request({ hook: 'pre-think' }));
		await client.screen(request({ hook: 'post-act' }));
		expect(calls[0]?.url).toBe(
			'https://bedrock-runtime.eu-west-2.amazonaws.com/guardrail/gr-stand-in/version/1/apply'
		);
		expect(calls[0]?.body).toEqual({ source: 'INPUT', content: [{ text: { text: 'hello' } }] });
		expect(calls[1]?.body).toMatchObject({ source: 'OUTPUT' });
		expect(calls[0]?.headers['authorization']).toMatch(
			/^AWS4-HMAC-SHA256 Credential=AKIAPLANTEDKEYID1234\//
		);
		expect(calls[0]?.headers['authorization']).not.toContain('plantedSecretAccessKey');
	});

	it('maps a 403 to no-permission with both halves scrubbed, a missing credential to bad-token, a rejecting fetch to unavailable', async () => {
		const denied = fetchFrom({ message: `bad ${SECRET.split(':')[1]}` }, 403);
		const client = createBedrockClient({
			config: CONFIG,
			fetch: denied.fetchImpl,
			credential: () => SECRET
		});
		const result = await client.apply('hello', 'INPUT');
		expect('error' in result && result.error.kind).toBe('no-permission');
		expect(JSON.stringify(result)).not.toContain('plantedSecretAccessKey');
		const none = createBedrockClient({
			config: CONFIG,
			fetch: denied.fetchImpl,
			credential: () => undefined
		});
		expect(
			'error' in (await none.apply('x', 'INPUT')) && (await none.apply('x', 'INPUT'))
		).toMatchObject({
			error: { kind: 'bad-token' }
		});
		const down = createBedrockClient({
			config: CONFIG,
			fetch: () => Promise.reject(new Error(`boom ${SECRET}`)),
			credential: () => SECRET
		});
		const failed = await down.apply('x', 'OUTPUT');
		expect('error' in failed && failed.error.kind).toBe('unavailable');
		expect(JSON.stringify(failed)).not.toContain('plantedSecretAccessKey');
		expect(scrubSecret(`a ${SECRET} b`, SECRET)).toBe('a [key-redacted]:[key-redacted] b');
	});
});

describe('the service', () => {
	it('is not browser-capable, declares the regional host, and its component says so', () => {
		expect(bedrockGuardrailsService.browserCapable).toBe(false);
		expect(bedrockGuardrailsService.egress.map((e) => e.host)).toEqual([
			'bedrock-runtime.*.amazonaws.com'
		]);
		expect(pack.guardrailComponents?.[0]?.connection).toMatchObject({
			kind: 'hosted',
			wraps: 'aws/bedrock-guardrails',
			browserCapable: false,
			standIn: 'offline-fixture'
		});
	});

	it('offline: serves the fixture the config names, clean by default; refuses a bad region', async () => {
		const clean = await bedrockGuardrailsService.createOffline(CONFIG).screen(request());
		expect('reading' in clean && clean.reading.matched).toBe(false);
		const attack = await bedrockGuardrailsService
			.createOffline({ ...CONFIG, offlineFixture: 'prompt-attack' })
			.screen(request());
		expect('reading' in attack && attack.reading.matched).toBe(true);
		expect(attack.record.service).toBe('bedrock-guardrails');
		expect(
			bedrockGuardrailsService.configSchema.safeParse({ ...CONFIG, region: 'moon' }).success
		).toBe(false);
	});

	it('"Test the guard" asks whether the guardrail intervenes on the known attack', async () => {
		expect(
			(
				await validateBedrockCredential(
					SECRET,
					fetchFrom(fixtures['prompt-attack']).fetchImpl,
					CONFIG
				)
			).ok
		).toBe(true);
		expect(
			(await validateBedrockCredential(SECRET, fetchFrom(fixtures.clean).fetchImpl, CONFIG)).ok
		).toBe(false);
		expect(
			(await validateBedrockCredential('nope', fetchFrom(fixtures.clean).fetchImpl, CONFIG)).ok
		).toBe(false);
		expect(
			(await validateBedrockCredential(SECRET, fetchFrom(fixtures.clean).fetchImpl, {})).ok
		).toBe(false);
		expect(
			(
				await validateBedrockCredential(
					SECRET,
					fetchFrom(fixtures.forbidden, 403).fetchImpl,
					CONFIG
				)
			).message
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
		[bedrockGuardrailsService.id]: {
			config: {
				serviceConfig: CONFIG,
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
		[bedrockGuardrailsService.id]: {
			config: CONFIG,
			requests: (['pre-think', 'pre-act', 'post-act'] as const).map((hook) => request({ hook })),
			plantedSecret: SECRET
		}
	}
});
