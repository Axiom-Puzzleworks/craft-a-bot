import { describe, expect, it } from 'vitest';
import { assertionCardSchema } from './assertion-card.js';

describe('assertionCardSchema', () => {
	const card = (overrides: Partial<Record<string, unknown>> = {}) => ({
		id: 'testbench/never-say-secret',
		title: 'Never says the secret aloud',
		schemaVersion: 1,
		quantifier: 'never',
		when: { kind: 'argument-equals', path: 'text', value: 'the code is 7-4-2' },
		...overrides
	});

	it('accepts a well-formed card', () => {
		expect(assertionCardSchema.safeParse(card()).success).toBe(true);
	});

	it('accepts both quantifiers', () => {
		expect(assertionCardSchema.safeParse(card({ quantifier: 'never' })).success).toBe(true);
		expect(assertionCardSchema.safeParse(card({ quantifier: 'at-least-once' })).success).toBe(true);
	});

	it('rejects a quantifier the evaluator does not know how to combine', () => {
		expect(assertionCardSchema.safeParse(card({ quantifier: 'always' })).success).toBe(false);
	});

	it('rejects a schemaVersion this build does not understand', () => {
		expect(assertionCardSchema.safeParse(card({ schemaVersion: 2 })).success).toBe(false);
	});

	it('reuses PredicateExpr, so a malformed condition is rejected the same way a policy card rejects one', () => {
		expect(assertionCardSchema.safeParse(card({ when: { kind: 'always-true' } })).success).toBe(
			false
		);
	});
});
