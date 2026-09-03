import { describe, expect, it } from 'vitest';
import type { ScreenRequest } from '@craftabot/core';
import { fixtures } from '../fixtures/index.js';
import { armorConfigSchema } from './config.js';
import { readSanitizationResult, toScreenReading } from './reading.js';
import {
	armorSelectors,
	armorServiceConfigSchema,
	armorStrings,
	modelArmorService,
	screeningFor,
	serviceConfigFor
} from './service.js';
import { composeMatchReason } from './strings.js';

/**
 * WP39 stage D (`29-GUARD-SHELL.md` §4.5): Model Armor as a `GuardrailService`
 * — the reading in the shell's vocabulary with the vendor's words kept, the
 * config split, the strings adapter, and the service's own choice of call.
 */

const CONFIG = { projectId: 'proj-1', location: 'europe-west2', templateId: 'cab-armour' };
const request = (overrides: Partial<ScreenRequest> = {}): ScreenRequest => ({
	hook: 'pre-act',
	text: 'hello',
	envelope: { agentId: 'a', tick: 1 },
	...overrides
});

describe('toScreenReading', () => {
	it('keeps every filter as a finding, in trace order, with the vendor label and confidence string', () => {
		const reading = toScreenReading(readSanitizationResult(fixtures['injection-high']));
		expect(reading.findings.map((f) => f.vendorLabel)).toEqual([
			'injection',
			'hate',
			'harassment',
			'dangerous',
			'sexual',
			'sensitiveData',
			'maliciousUri',
			'csam'
		]);
		expect(reading.findings[0]).toEqual({
			category: 'injection',
			vendorLabel: 'injection',
			ran: true,
			matched: true,
			confidence: 'high',
			vendorConfidence: 'HIGH'
		});
		expect(reading.matched).toBe(true);
		expect(reading.outcome).toBe('ok');
	});

	it('maps the RAI filters and csam to harmful, SDP to sensitive-data, URIs to malicious-link', () => {
		const reading = toScreenReading(readSanitizationResult(fixtures.csam));
		const byLabel = Object.fromEntries(reading.findings.map((f) => [f.vendorLabel, f.category]));
		expect(byLabel).toEqual({
			injection: 'injection',
			hate: 'harmful',
			harassment: 'harmful',
			dangerous: 'harmful',
			sexual: 'harmful',
			sensitiveData: 'sensitive-data',
			maliciousUri: 'malicious-link',
			csam: 'harmful'
		});
		expect(modelArmorService.alwaysStop).toEqual(['csam']);
	});

	it('carries the redacted text through, noted only', () => {
		const reading = toScreenReading(readSanitizationResult(fixtures['sdp-deidentified']));
		expect(reading.redactedText).toBeDefined();
	});
});

describe('the service', () => {
	it('is well-formed, qualified, three-hooked, credentialed and declares its regional egress', () => {
		expect(modelArmorService.id).toBe('geap/model-armor');
		expect(modelArmorService.hooks).toEqual(['pre-think', 'pre-act', 'post-act']);
		expect(modelArmorService.credential?.id).toBe('geap');
		expect(modelArmorService.egress[0]?.host).toBe('modelarmor.*.rep.googleapis.com');
		expect(armorServiceConfigSchema.safeParse(CONFIG).success).toBe(true);
		expect(armorServiceConfigSchema.safeParse({ ...CONFIG, projectId: '' }).success).toBe(false);
	});

	it('offline: answers clean at every hook, naming the call it would have made', async () => {
		const client = modelArmorService.createOffline(CONFIG);
		const preThink = await client.screen(request({ hook: 'pre-think' }));
		const preAct = await client.screen(request({ hook: 'pre-act', context: 'seen' }));
		const postAct = await client.screen(request({ hook: 'post-act' }));
		for (const result of [preThink, preAct, postAct]) {
			expect('reading' in result && result.reading.matched).toBe(false);
			expect(result.record.service).toBe('model-armor');
			expect(result.record.template).toBe('cab-armour');
		}
		expect(preThink.record.endpoint).toContain(':sanitizeUserPrompt');
		expect(preAct.record.endpoint).toContain(':sanitizeModelResponse');
		expect(postAct.record.endpoint).toContain(':sanitizeModelResponse');
	});

	it('live: calls the regional endpoint with the bearer token, and shapes a fixture into a reading', async () => {
		const calls: Array<{ url: string; body: unknown; auth: string | null }> = [];
		const fetchStub: typeof fetch = async (input, init) => {
			calls.push({
				url: String(input),
				body: JSON.parse(String(init?.body)),
				auth: new Headers(init?.headers).get('authorization')
			});
			return new Response(JSON.stringify(fixtures['sdp-basic']), { status: 200 });
		};
		const client = modelArmorService.create({
			config: CONFIG,
			fetch: fetchStub,
			getCredential: (id) => (id === 'geap' ? 'tok-1' : undefined),
			timeoutMs: 3000
		});
		const result = await client.screen(
			request({ hook: 'pre-act', text: 'my card is 4111', context: 'a shop' })
		);
		expect(calls[0]?.url).toBe(
			'https://modelarmor.europe-west2.rep.googleapis.com/v1/projects/proj-1/locations/europe-west2/templates/cab-armour:sanitizeModelResponse'
		);
		expect(calls[0]?.body).toEqual({
			modelResponseData: { text: 'my card is 4111' },
			userPrompt: 'a shop'
		});
		expect(calls[0]?.auth).toBe('Bearer tok-1');
		expect(
			'reading' in result &&
				result.reading.findings.find((f) => f.vendorLabel === 'sensitiveData')?.matched
		).toBe(true);
	});

	it('live: a transport failure is an error result, never a throw, with the token scrubbed', async () => {
		const client = modelArmorService.create({
			config: CONFIG,
			fetch: () => Promise.reject(new Error('boom tok-1')),
			getCredential: () => 'tok-1',
			timeoutMs: 3000
		});
		const result = await client.screen(request());
		expect('error' in result && result.error.kind).toBe('unavailable');
		expect(JSON.stringify(result)).not.toContain('tok-1');
	});
});

describe('the config split', () => {
	it("reads the shell's dials off the brick's config, mapping filters to categories and confidence to the neutral scale", () => {
		const config = armorConfigSchema.parse({
			...CONFIG,
			screenObservation: 'note',
			filters: { injection: 'stop', harmfulContent: 'off' },
			injectionMinConfidence: 'HIGH',
			offline: true
		});
		expect(screeningFor(config)).toEqual({
			screenObservation: 'note',
			screenDecision: 'ask',
			screenResult: 'off',
			perCategory: {
				injection: 'stop',
				harmful: 'off',
				'sensitive-data': 'inherit',
				'malicious-link': 'inherit'
			},
			minConfidence: 'high',
			onFailure: 'stop-run',
			timeoutMs: 3000,
			offline: true
		});
		expect(serviceConfigFor(config)).toEqual({ ...CONFIG, injectionMinConfidence: 'HIGH' });
	});
});

describe('the strings adapter', () => {
	it("composes the brick's own reason from vendor labels and confidence strings", () => {
		expect(
			armorStrings.match([
				{
					category: 'injection',
					vendorLabel: 'injection',
					confidence: 'high',
					vendorConfidence: 'HIGH'
				},
				{ category: 'sensitive-data', vendorLabel: 'sensitiveData' }
			])
		).toBe(
			composeMatchReason([{ key: 'injection', confidence: 'HIGH' }, { key: 'sensitiveData' }])
		);
		expect(armorStrings.transport('quota')).toContain('too many checks');
	});
});

describe('the selectors', () => {
	it('find nothing on an empty history at every hook', () => {
		const ctx = {
			hook: 'pre-act' as const,
			tick: 1,
			spec: { id: 'a' },
			usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
			worldState: {},
			history: []
		} as unknown as Parameters<(typeof armorSelectors)['pre-act']>[0];
		expect(armorSelectors['pre-think'](ctx)).toBeUndefined();
		expect(armorSelectors['pre-act'](ctx)).toBeUndefined();
		expect(armorSelectors['post-act'](ctx)).toBeUndefined();
	});
});
