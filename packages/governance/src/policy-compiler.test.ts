import type { PolicyCard, PredicateExpr } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { action, context, tool } from './test-context.js';
import { compilePolicyCard, evaluatePredicate } from './policy-compiler.js';

/**
 * The policy-card compiler (`14-…` §4.6, WP22) — a card is data, compiled
 * into ordinary guardrails, exactly the shape `08-…` §5 promised: "the
 * `Guardrail` interface unchanged."
 */

describe('evaluatePredicate', () => {
	const usage = { ticks: 0, inputTokens: 0, outputTokens: 0 };

	it('matches on call kind', () => {
		const expr: PredicateExpr = { kind: 'call-kind-is', value: 'action' };
		expect(evaluatePredicate(expr, { proposed: action('open'), usage })).toBe(true);
		expect(evaluatePredicate(expr, { proposed: tool('dice'), usage })).toBe(false);
		expect(evaluatePredicate(expr, { usage })).toBe(false);
	});

	it('matches on call name', () => {
		const expr: PredicateExpr = { kind: 'call-name-is', value: 'give' };
		expect(evaluatePredicate(expr, { proposed: action('give'), usage })).toBe(true);
		expect(evaluatePredicate(expr, { proposed: action('open'), usage })).toBe(false);
	});

	it('matches a world-qualified call name against its bare local name (E6)', () => {
		// The same "compare by local name" answer createActionBlocklistGuardrail
		// gives: a card written against `open` should not go blind the day the
		// world action is qualified `starter/playroom/open`.
		const expr: PredicateExpr = { kind: 'call-name-is', value: 'open' };
		expect(evaluatePredicate(expr, { proposed: action('starter/playroom/open'), usage })).toBe(
			true
		);
	});

	it('matches on an argument literal, including nested paths', () => {
		const expr: PredicateExpr = { kind: 'argument-equals', path: 'character', value: 'teddy' };
		expect(
			evaluatePredicate(expr, { proposed: action('give', { character: 'teddy' }), usage })
		).toBe(true);
		expect(
			evaluatePredicate(expr, { proposed: action('give', { character: 'not-teddy' }), usage })
		).toBe(false);
		// No arguments at all, or a path that is not there: false, not a throw.
		expect(evaluatePredicate(expr, { proposed: action('give'), usage })).toBe(false);

		const nested: PredicateExpr = { kind: 'argument-equals', path: 'to.id', value: 'teddy' };
		expect(
			evaluatePredicate(nested, { proposed: action('give', { to: { id: 'teddy' } }), usage })
		).toBe(true);
	});

	it('matches usage at or past a threshold', () => {
		const expr: PredicateExpr = { kind: 'usage-at-least', field: 'ticks', value: 10 };
		expect(evaluatePredicate(expr, { usage: { ...usage, ticks: 10 } })).toBe(true);
		expect(evaluatePredicate(expr, { usage: { ...usage, ticks: 9 } })).toBe(false);
	});

	it('composes with and/or/not', () => {
		const expr: PredicateExpr = {
			kind: 'and',
			all: [
				{ kind: 'call-name-is', value: 'give' },
				{ kind: 'not', expr: { kind: 'argument-equals', path: 'character', value: 'teddy' } }
			]
		};
		expect(evaluatePredicate(expr, { proposed: action('give', { character: 'bob' }), usage })).toBe(
			true
		);
		expect(
			evaluatePredicate(expr, { proposed: action('give', { character: 'teddy' }), usage })
		).toBe(false);

		const anyOf: PredicateExpr = {
			kind: 'or',
			any: [
				{ kind: 'call-name-is', value: 'open' },
				{ kind: 'usage-at-least', field: 'ticks', value: 5 }
			]
		};
		expect(evaluatePredicate(anyOf, { proposed: action('open'), usage })).toBe(true);
		expect(
			evaluatePredicate(anyOf, { proposed: action('move'), usage: { ...usage, ticks: 5 } })
		).toBe(true);
		expect(evaluatePredicate(anyOf, { proposed: action('move'), usage })).toBe(false);
	});
});

function card(overrides: Partial<PolicyCard> = {}): PolicyCard {
	return {
		id: 'test/policy/no-snack-theft',
		title: "Never take Teddy's snack",
		schemaVersion: 1,
		rules: [
			{
				hook: 'pre-act',
				when: {
					kind: 'and',
					all: [
						{ kind: 'call-name-is', value: 'give' },
						{ kind: 'not', expr: { kind: 'argument-equals', path: 'character', value: 'teddy' } }
					]
				},
				then: 'block-action',
				reason: "The snack is Teddy's."
			}
		],
		...overrides
	};
}

describe('compilePolicyCard', () => {
	it('allows when the rule does not fire', () => {
		const [guardrail] = compilePolicyCard(card());
		const verdict = guardrail!.check(context({ hook: 'pre-act', proposed: action('open') }));
		expect(verdict).toStrictEqual({ allow: true });
	});

	it('blocks the action and carries the rule reason, when it does', () => {
		const [guardrail] = compilePolicyCard(card());
		const verdict = guardrail!.check(
			context({ hook: 'pre-act', proposed: action('give', { character: 'bob' }) })
		);
		expect(verdict).toStrictEqual({
			allow: false,
			reason: "The snack is Teddy's.",
			disposition: 'block-action'
		});
	});

	it('compiles stop-run to allow:false with disposition stop-run', () => {
		const [guardrail] = compilePolicyCard(
			card({
				rules: [
					{
						hook: 'pre-think',
						when: { kind: 'usage-at-least', field: 'ticks', value: 20 },
						then: 'stop-run',
						reason: 'Long enough.'
					}
				]
			})
		);
		const verdict = guardrail!.check(
			context({ hook: 'pre-think', usage: { ticks: 20, inputTokens: 0, outputTokens: 0 } })
		);
		expect(verdict).toStrictEqual({
			allow: false,
			reason: 'Long enough.',
			disposition: 'stop-run'
		});
	});

	it('compiles require-approval to a pause verdict', () => {
		const [guardrail] = compilePolicyCard(
			card({
				rules: [
					{
						hook: 'pre-act',
						when: { kind: 'call-name-is', value: 'open' },
						then: 'require-approval',
						reason: 'Opening things needs a person.'
					}
				]
			})
		);
		const verdict = guardrail!.check(context({ hook: 'pre-act', proposed: action('open') }));
		expect(verdict).toStrictEqual({ pause: true, reason: 'Opening things needs a person.' });
	});

	it('sets policyCardId, the card title as name, and the rule reason as description', () => {
		const [guardrail] = compilePolicyCard(card());
		expect(guardrail?.policyCardId).toBe('test/policy/no-snack-theft');
		expect(guardrail?.name).toBe("Never take Teddy's snack");
		expect(guardrail?.description).toBe("The snack is Teddy's.");
	});

	it('scopes each guardrail to its own rule’s hook', () => {
		const [guardrail] = compilePolicyCard(card());
		expect(guardrail?.hooks).toStrictEqual(['pre-act']);
	});

	it('compiles one guardrail per rule, each with its own id, in rule order', () => {
		const twoRule = card({
			rules: [
				{
					hook: 'pre-act',
					when: { kind: 'call-name-is', value: 'open' },
					then: 'block-action',
					reason: 'No opening.'
				},
				{
					hook: 'post-act',
					when: { kind: 'call-name-is', value: 'say' },
					then: 'require-approval',
					reason: 'Check what was said.'
				}
			]
		});
		const guardrails = compilePolicyCard(twoRule);
		expect(guardrails).toHaveLength(2);
		expect(guardrails.map((g) => g.id)).toEqual([
			'test/policy/no-snack-theft#rule-0',
			'test/policy/no-snack-theft#rule-1'
		]);
		expect(new Set(guardrails.map((g) => g.id)).size).toBe(2);
	});

	it('is pure: the same context checked twice gives the same verdict', () => {
		const [guardrail] = compilePolicyCard(card());
		const ctx = context({ hook: 'pre-act', proposed: action('give', { character: 'bob' }) });
		expect(guardrail!.check(structuredClone(ctx))).toStrictEqual(
			guardrail!.check(structuredClone(ctx))
		);
	});
});
