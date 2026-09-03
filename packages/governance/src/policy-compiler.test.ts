import type { EngineEvent, PolicyCard, PredicateExpr } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { action, context, tool } from './test-context.js';
import { compilePolicyCard, evaluatePredicate, predicateContextFor } from './policy-compiler.js';

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

describe('the v2 leaves (WP45)', () => {
	const usage = { ticks: 0, inputTokens: 0, outputTokens: 0 };

	it('argument-contains: a substring of a string, or a member of an array', () => {
		const expr: PredicateExpr = { kind: 'argument-contains', path: 'text', value: '7734' };
		expect(
			evaluatePredicate(expr, { proposed: action('say', { text: 'the code is 7734!' }), usage })
		).toBe(true);
		expect(evaluatePredicate(expr, { proposed: action('say', { text: 'hello' }), usage })).toBe(
			false
		);
		expect(
			evaluatePredicate(expr, { proposed: action('say', { text: ['a', '7734'] }), usage })
		).toBe(true);
		expect(evaluatePredicate(expr, { proposed: action('say', { text: 7734 }), usage })).toBe(false);
		expect(evaluatePredicate(expr, { usage })).toBe(false);
	});

	it('argument-matches: the bounded pattern against a string argument only', () => {
		const expr: PredicateExpr = {
			kind: 'argument-matches',
			path: 'text',
			pattern: '[0-9][0-9][0-9][0-9]'
		};
		expect(
			evaluatePredicate(expr, { proposed: action('say', { text: 'code 7734 here' }), usage })
		).toBe(true);
		expect(evaluatePredicate(expr, { proposed: action('say', { text: 'code 77' }), usage })).toBe(
			false
		);
		expect(evaluatePredicate(expr, { proposed: action('say', { text: 7734 }), usage })).toBe(false);
	});

	it('observation-contains: the current observation, absent means false', () => {
		const expr: PredicateExpr = { kind: 'observation-contains', value: 'chest' };
		expect(
			evaluatePredicate(expr, {
				usage,
				observation: { channels: [], text: 'A toy chest sits here.' }
			})
		).toBe(true);
		expect(
			evaluatePredicate(expr, { usage, observation: { channels: [], text: 'Nothing.' } })
		).toBe(false);
		expect(evaluatePredicate(expr, { usage })).toBe(false);
	});

	it('world-predicate: the world answers, absent means false', () => {
		const expr: PredicateExpr = { kind: 'world-predicate', predicateId: 'chest-open' };
		const world = { test: (id: string) => id === 'chest-open', predicates: ['chest-open'] };
		expect(evaluatePredicate(expr, { usage, world })).toBe(true);
		expect(
			evaluatePredicate({ kind: 'world-predicate', predicateId: 'other' }, { usage, world })
		).toBe(false);
		expect(evaluatePredicate(expr, { usage })).toBe(false);
	});

	it('history-count: events of a type, optionally by name', () => {
		const performed = (name: string) =>
			({
				type: 'action.performed',
				payload: { name, arguments: {}, result: { ok: true, narration: '', stateDiff: [] } }
			}) as unknown as EngineEvent;
		const history = [performed('say'), performed('move'), performed('say')];
		expect(
			evaluatePredicate(
				{ kind: 'history-count', type: 'action.performed', name: 'say', atLeast: 2 },
				{ usage, history }
			)
		).toBe(true);
		expect(
			evaluatePredicate(
				{ kind: 'history-count', type: 'action.performed', name: 'say', atLeast: 3 },
				{ usage, history }
			)
		).toBe(false);
		expect(
			evaluatePredicate(
				{ kind: 'history-count', type: 'action.performed', atLeast: 3 },
				{ usage, history }
			)
		).toBe(true);
		expect(
			evaluatePredicate({ kind: 'history-count', type: 'tool.executed', atLeast: 1 }, { usage })
		).toBe(false);
	});

	it('hook-is: the hook being checked', () => {
		expect(
			evaluatePredicate({ kind: 'hook-is', hook: 'pre-act' }, { usage, hook: 'pre-act' })
		).toBe(true);
		expect(
			evaluatePredicate({ kind: 'hook-is', hook: 'pre-act' }, { usage, hook: 'post-act' })
		).toBe(false);
		expect(evaluatePredicate({ kind: 'hook-is', hook: 'pre-act' }, { usage })).toBe(false);
	});

	it('predicateContextFor hands a rule the whole guardrail context', () => {
		const ctx = {
			...context({ hook: 'pre-act', proposed: action('say', { text: 'hi' }) }),
			observation: { channels: [], text: 'A chest.' }
		};
		const evalCtx = predicateContextFor({
			...ctx,
			world: { test: () => true, predicates: ['x'] }
		});
		expect(evalCtx.hook).toBe('pre-act');
		expect(evalCtx.observation?.text).toBe('A chest.');
		expect(evalCtx.world?.test('x')).toBe(true);
		expect(evalCtx.history).toBe(ctx.history);
		// A compiled rule sees it: a card on the world's own predicate fires.
		const card: PolicyCard = {
			id: 'p/world',
			title: 'World',
			schemaVersion: 1,
			rules: [
				{
					hook: 'pre-act',
					when: { kind: 'world-predicate', predicateId: 'x' },
					then: 'stop-run',
					reason: 'the world says so'
				}
			]
		};
		const [rule] = compilePolicyCard(card);
		expect(rule?.check({ ...ctx, world: { test: () => true, predicates: ['x'] } })).toMatchObject({
			allow: false,
			disposition: 'stop-run'
		});
		expect(rule?.check(ctx)).toEqual({ allow: true });
	});
});
