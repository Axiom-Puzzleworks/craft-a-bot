import { describe, expect, it } from 'vitest';
import { policyCardSchema, predicateExprSchema } from './policy-card.js';

/**
 * `PredicateExpr` (`14-…` §4.6, WP22) — deliberately tiny, and composable.
 * These cover the shape rather than the evaluator (`@craftabot/governance`
 * owns evaluating one against a `GuardrailContext`); this is just proving the
 * schema accepts what it should and closes what it should.
 */
describe('predicateExprSchema', () => {
	it('accepts each leaf kind', () => {
		expect(predicateExprSchema.safeParse({ kind: 'call-kind-is', value: 'action' }).success).toBe(
			true
		);
		expect(predicateExprSchema.safeParse({ kind: 'call-name-is', value: 'give' }).success).toBe(
			true
		);
		expect(
			predicateExprSchema.safeParse({ kind: 'argument-equals', path: 'character', value: 'teddy' })
				.success
		).toBe(true);
		expect(
			predicateExprSchema.safeParse({ kind: 'usage-at-least', field: 'ticks', value: 10 }).success
		).toBe(true);
	});

	it('nests and/or/not arbitrarily deep', () => {
		const nested = {
			kind: 'and',
			all: [
				{ kind: 'call-name-is', value: 'give' },
				{
					kind: 'or',
					any: [
						{ kind: 'not', expr: { kind: 'argument-equals', path: 'character', value: 'teddy' } },
						{ kind: 'usage-at-least', field: 'ticks', value: 20 }
					]
				}
			]
		};
		expect(predicateExprSchema.safeParse(nested).success).toBe(true);
	});

	it('rejects a kind nothing recognises — the union is closed, like a guardrail verdict', () => {
		expect(predicateExprSchema.safeParse({ kind: 'always-true' }).success).toBe(false);
	});

	it('rejects an empty and/or — a rule that composes nothing is not a rule', () => {
		expect(predicateExprSchema.safeParse({ kind: 'and', all: [] }).success).toBe(false);
		expect(predicateExprSchema.safeParse({ kind: 'or', any: [] }).success).toBe(false);
	});

	it('rejects an argument value that is not a JSON literal — no smuggling objects or arrays through', () => {
		expect(
			predicateExprSchema.safeParse({ kind: 'argument-equals', path: 'x', value: { nested: true } })
				.success
		).toBe(false);
	});
});

describe('policyCardSchema', () => {
	const card = (overrides: Partial<Record<string, unknown>> = {}) => ({
		id: 'starter/policy/no-snack-theft',
		title: "Never take Teddy's snack",
		schemaVersion: 1,
		rules: [
			{
				hook: 'pre-act',
				when: { kind: 'call-name-is', value: 'give' },
				then: 'block-action',
				reason: "The snack is Teddy's."
			}
		],
		...overrides
	});

	it('accepts a well-formed card', () => {
		expect(policyCardSchema.safeParse(card()).success).toBe(true);
	});

	it('rejects a card with no rules', () => {
		expect(policyCardSchema.safeParse(card({ rules: [] })).success).toBe(false);
	});

	it('rejects a disposition outside the three the engine knows how to compile', () => {
		expect(
			policyCardSchema.safeParse(
				card({
					rules: [
						{
							hook: 'pre-act',
							when: { kind: 'call-name-is', value: 'give' },
							then: 'shrug',
							reason: 'x'
						}
					]
				})
			).success
		).toBe(false);
	});

	it('rejects a schemaVersion this build does not understand', () => {
		expect(policyCardSchema.safeParse(card({ schemaVersion: 2 })).success).toBe(false);
	});
});
