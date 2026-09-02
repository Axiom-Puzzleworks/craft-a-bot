import type { EngineEvent, PolicyCard } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import {
	conditionToExpr,
	conditionsToWhen,
	draftRuleToPolicyRule,
	newCondition,
	newRule,
	parseLiteral,
	replayCard,
	runScriptedProbe,
	type ConditionRow
} from './policy-studio.js';

/**
 * Policy Studio's pure logic (`17-…` §4.5, WP22 slice e): turning the rule
 * builder's flat form rows into real `PredicateExpr`s, and replaying a card
 * against a stored trace.
 */

describe('parseLiteral', () => {
	it('parses booleans and null, and leaves everything else a string', () => {
		expect(parseLiteral('true')).toBe(true);
		expect(parseLiteral('false')).toBe(false);
		expect(parseLiteral('null')).toBe(null);
		expect(parseLiteral('42')).toBe(42);
		expect(parseLiteral('toy chest')).toBe('toy chest');
	});
});

describe('conditionToExpr', () => {
	it('compiles each leaf kind', () => {
		expect(conditionToExpr({ ...newCondition(), kind: 'call-kind-is', callKind: 'tool' })).toEqual({
			kind: 'call-kind-is',
			value: 'tool'
		});

		expect(conditionToExpr({ ...newCondition(), kind: 'call-name-is', name: 'open' })).toEqual({
			kind: 'call-name-is',
			value: 'open'
		});

		expect(
			conditionToExpr({
				...newCondition(),
				kind: 'argument-equals',
				path: 'container',
				argValue: 'toy chest'
			})
		).toEqual({ kind: 'argument-equals', path: 'container', value: 'toy chest' });

		expect(
			conditionToExpr({ ...newCondition(), kind: 'usage-at-least', field: 'ticks', threshold: 10 })
		).toEqual({ kind: 'usage-at-least', field: 'ticks', value: 10 });
	});

	it('wraps a negated condition in not', () => {
		const row: ConditionRow = {
			...newCondition(),
			negate: true,
			kind: 'call-name-is',
			name: 'open'
		};
		expect(conditionToExpr(row)).toEqual({
			kind: 'not',
			expr: { kind: 'call-name-is', value: 'open' }
		});
	});
});

describe('conditionsToWhen', () => {
	it('a single condition needs no and wrapper', () => {
		const rows: ConditionRow[] = [{ ...newCondition(), kind: 'call-name-is', name: 'open' }];
		expect(conditionsToWhen(rows)).toEqual({ kind: 'call-name-is', value: 'open' });
	});

	it('ANDs two or more conditions together', () => {
		const rows: ConditionRow[] = [
			{ ...newCondition(), kind: 'call-name-is', name: 'give' },
			{
				...newCondition(),
				negate: true,
				kind: 'argument-equals',
				path: 'character',
				argValue: 'teddy'
			}
		];
		expect(conditionsToWhen(rows)).toEqual({
			kind: 'and',
			all: [
				{ kind: 'call-name-is', value: 'give' },
				{ kind: 'not', expr: { kind: 'argument-equals', path: 'character', value: 'teddy' } }
			]
		});
	});
});

describe('draftRuleToPolicyRule', () => {
	it('falls back to a placeholder reason rather than an empty one', () => {
		const rule = draftRuleToPolicyRule(newRule());
		expect(rule.reason).toBe('(no reason given yet)');
	});

	it('carries the reason through when one is given', () => {
		const rule = draftRuleToPolicyRule({ ...newRule(), reason: 'Because.' });
		expect(rule.reason).toBe('Because.');
	});
});

describe('replayCard', () => {
	const card: PolicyCard = {
		id: 'test/policy/no-open',
		title: 'No opening',
		schemaVersion: 1,
		rules: [
			{
				hook: 'pre-act',
				when: { kind: 'call-name-is', value: 'open' },
				then: 'block-action',
				reason: 'The chest stays shut.'
			}
		]
	};

	function decisionEvent(
		tick: number,
		call: { kind: 'tool' | 'action'; name: string } | null
	): EngineEvent {
		return {
			id: `e${tick}`,
			runId: 'r1',
			tick,
			timestamp: '2026-08-16T09:00:00.000Z',
			type: 'decision',
			payload: { thought: '', call: call && { ...call, arguments: {} } }
		} as EngineEvent;
	}

	it('reports every tick the rule would have fired', () => {
		const events = [
			decisionEvent(1, { kind: 'action', name: 'move' }),
			decisionEvent(2, { kind: 'action', name: 'open' }),
			decisionEvent(3, { kind: 'action', name: 'move' })
		];
		const hits = replayCard(card, events);
		expect(hits).toEqual([
			{
				tick: 2,
				callKind: 'action',
				callName: 'open',
				ruleIndex: 0,
				reason: 'The chest stays shut.'
			}
		]);
	});

	it('finds nothing when the card never would have fired', () => {
		const events = [decisionEvent(1, { kind: 'action', name: 'move' })];
		expect(replayCard(card, events)).toEqual([]);
	});

	it('skips a mumbled decision — no call, nothing to check', () => {
		const events = [decisionEvent(1, null)];
		expect(replayCard(card, events)).toEqual([]);
	});

	it('evaluates a usage-at-least rule against the tick the decision happened on', () => {
		const budgetCard: PolicyCard = {
			id: 'test/policy/wrap-up',
			title: 'Wrap up',
			schemaVersion: 1,
			rules: [
				{
					hook: 'pre-think',
					when: { kind: 'usage-at-least', field: 'ticks', value: 3 },
					then: 'stop-run',
					reason: 'Long enough.'
				}
			]
		};
		const events = [
			decisionEvent(1, { kind: 'action', name: 'move' }),
			decisionEvent(2, { kind: 'action', name: 'move' }),
			decisionEvent(3, { kind: 'action', name: 'move' })
		];
		const hits = replayCard(budgetCard, events);
		expect(hits).toEqual([
			{ tick: 3, callKind: 'action', callName: 'move', ruleIndex: 0, reason: 'Long enough.' }
		]);
	});
});

describe('runScriptedProbe', () => {
	it('fires a card that watches for something the probe actually calls', async () => {
		const card: PolicyCard = {
			id: 'test/policy/no-opening',
			title: 'No opening',
			schemaVersion: 1,
			rules: [
				{
					hook: 'pre-act',
					when: { kind: 'call-name-is', value: 'open' },
					then: 'block-action',
					reason: 'Stays shut.'
				}
			]
		};
		const result = await runScriptedProbe(card);
		expect(result.hits.length).toBeGreaterThan(0);
		expect(result.hits[0]).toMatchObject({ callName: 'open', ruleIndex: 0, reason: 'Stays shut.' });
		expect(result.outcome).toBeDefined();
	});

	it('never fires a card watching for something the probe never calls', async () => {
		const card: PolicyCard = {
			id: 'test/policy/never',
			title: 'Never',
			schemaVersion: 1,
			rules: [
				{
					hook: 'pre-act',
					when: { kind: 'call-name-is', value: 'give' },
					then: 'block-action',
					reason: 'Unreachable in the probe.'
				}
			]
		};
		const result = await runScriptedProbe(card);
		expect(result.hits).toEqual([]);
	});
});

describe('the v2 leaves in the Studio (WP45)', () => {
	const row = (overrides: Partial<ConditionRow>): ConditionRow => ({
		...newCondition(),
		...overrides
	});

	it('builds each of the six leaves from a condition row', () => {
		expect(
			conditionToExpr(row({ kind: 'argument-contains', path: 'text', argValue: '7734' }))
		).toEqual({
			kind: 'argument-contains',
			path: 'text',
			value: '7734'
		});
		expect(
			conditionToExpr(row({ kind: 'argument-matches', path: 'text', pattern: '[0-9][0-9]' }))
		).toEqual({ kind: 'argument-matches', path: 'text', pattern: '[0-9][0-9]' });
		expect(conditionToExpr(row({ kind: 'observation-contains', argValue: 'chest' }))).toEqual({
			kind: 'observation-contains',
			value: 'chest'
		});
		expect(conditionToExpr(row({ kind: 'world-predicate', predicateId: 'chest-open' }))).toEqual({
			kind: 'world-predicate',
			predicateId: 'chest-open'
		});
		expect(
			conditionToExpr(
				row({ kind: 'history-count', eventType: 'action.performed', name: 'say', count: 2 })
			)
		).toEqual({ kind: 'history-count', type: 'action.performed', name: 'say', atLeast: 2 });
		expect(
			conditionToExpr(row({ kind: 'history-count', eventType: 'tool.executed', count: 1 }))
		).toEqual({
			kind: 'history-count',
			type: 'tool.executed',
			atLeast: 1
		});
		expect(conditionToExpr(row({ kind: 'hook-is', hook: 'post-act', negate: true }))).toEqual({
			kind: 'not',
			expr: { kind: 'hook-is', hook: 'post-act' }
		});
	});

	it('the replay stands at pre-act with the trace so far and the last observation', () => {
		const at = (tick: number, type: string, payload: unknown): EngineEvent =>
			({
				id: `e${tick}-${type}`,
				runId: 'r',
				tick,
				at: '2026-09-02T00:00:00.000Z',
				type,
				payload
			}) as unknown as EngineEvent;
		const say = (tick: number, text: string) =>
			at(tick, 'decision', {
				thought: 'hm',
				call: { kind: 'action', name: 'say', arguments: { text } }
			});
		const events = [
			at(1, 'sense', {
				channels: ['sight'],
				observation: { channels: ['sight'], text: 'A toy chest.' }
			}),
			say(1, 'one'),
			at(1, 'action.performed', {
				name: 'say',
				arguments: { text: 'one' },
				result: { ok: true, narration: '', stateDiff: [] }
			}),
			at(2, 'sense', {
				channels: ['sight'],
				observation: { channels: ['sight'], text: 'Nothing here.' }
			}),
			say(2, 'two'),
			at(2, 'action.performed', {
				name: 'say',
				arguments: { text: 'two' },
				result: { ok: true, narration: '', stateDiff: [] }
			}),
			say(3, 'three')
		];
		const card: PolicyCard = {
			id: 'w/policy/v2',
			title: 'v2',
			schemaVersion: 1,
			rules: [
				{
					hook: 'pre-act',
					when: { kind: 'observation-contains', value: 'chest' },
					then: 'block-action',
					reason: 'chest in sight'
				},
				{
					hook: 'pre-act',
					when: { kind: 'history-count', type: 'action.performed', name: 'say', atLeast: 2 },
					then: 'block-action',
					reason: 'two said'
				},
				{
					hook: 'pre-act',
					when: { kind: 'hook-is', hook: 'pre-act' },
					then: 'block-action',
					reason: 'always'
				},
				{
					hook: 'pre-act',
					when: { kind: 'world-predicate', predicateId: 'x' },
					then: 'stop-run',
					reason: 'never in replay'
				}
			]
		};
		const hits = replayCard(card, events);
		expect(hits.map((hit) => [hit.tick, hit.ruleIndex])).toEqual([
			[1, 0],
			[1, 2],
			[2, 2],
			[3, 1],
			[3, 2]
		]);
	});
});
