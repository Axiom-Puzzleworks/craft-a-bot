import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
	describeGuardrailServiceProblems,
	egressDeclarationSchema,
	findingCategorySchema,
	type GuardrailService,
	type ScreenResult
} from './guardrail-service.js';

/** A minimal, well-formed service — what a vendor pack ships (`29-…` §4.3). */
export function stubService(overrides: Partial<GuardrailService> = {}): GuardrailService {
	const answer: ScreenResult = {
		reading: { outcome: 'ok', matched: false, findings: [] },
		record: { service: 'stub', endpoint: 'https://stub.example.test/screen' }
	};
	return {
		id: 'test/stub',
		name: 'Stub guard',
		description: 'Answers all-clear.',
		hooks: ['pre-think', 'pre-act', 'post-act'],
		egress: [{ host: 'stub.example.test', purpose: 'content screening', sends: ['decision'] }],
		configSchema: z.object({}),
		create: () => ({ screen: () => Promise.resolve(answer) }),
		createOffline: () => ({ screen: () => Promise.resolve(answer) }),
		...overrides
	};
}

describe('describeGuardrailServiceProblems', () => {
	it('finds nothing wrong with a well-formed service', () => {
		expect(describeGuardrailServiceProblems(stubService())).toEqual([]);
	});

	it('names every missing piece, and a malformed egress row', () => {
		const broken = stubService({
			id: '',
			hooks: [],
			egress: [{ host: '', purpose: 'x', sends: [] } as never],
			configSchema: undefined as never,
			create: undefined as never,
			createOffline: undefined as never
		});
		expect(describeGuardrailServiceProblems(broken)).toEqual([
			'has no id',
			'declares no hooks',
			'has a malformed egress declaration: {"host":"","purpose":"x","sends":[]}',
			'has no configSchema',
			'has no create()',
			'has no createOffline()'
		]);
	});
});

describe('the vocabularies', () => {
	it('closes the finding categories at seven, with "other" as the escape hatch', () => {
		expect(findingCategorySchema.options).toEqual([
			'injection',
			'jailbreak',
			'harmful',
			'sensitive-data',
			'malicious-link',
			'policy-violation',
			'other'
		]);
	});

	it('requires an egress declaration to say what leaves', () => {
		expect(
			egressDeclarationSchema.safeParse({ host: 'a.example', purpose: 'p', sends: [] }).success
		).toBe(false);
		expect(
			egressDeclarationSchema.safeParse({
				host: 'modelarmor.*.rep.googleapis.com',
				purpose: 'content screening',
				sends: ['observation', 'credential-header']
			}).success
		).toBe(true);
	});
});
