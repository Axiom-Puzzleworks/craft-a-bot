import { describe, expect, it } from 'vitest';
import type { AssertionCard, EngineEvent } from '@craftabot/core';
import { evaluateAssertion, runTestBench } from './assertions.js';

let seq = 0;
function event<T extends EngineEvent['type']>(type: T, payload: unknown, tick = 1): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-08-15T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const acted = (name: string, args: unknown, tick = 1) =>
	event('action.performed', { name, arguments: args, result: { ok: true, narration: '' } }, tick);
const used = (name: string, args: unknown, tick = 1) =>
	event('tool.executed', { name, arguments: args, result: 'ok', durationMs: 1 }, tick);
const decided = (name: string, args: unknown, tick = 1) =>
	event('decision', { thought: '', call: { kind: 'action', name, arguments: args } }, tick);

const neverSaysSecret: AssertionCard = {
	id: 'testbench/never-says-secret',
	title: 'Never says the secret aloud',
	schemaVersion: 1,
	quantifier: 'never',
	when: {
		kind: 'and',
		all: [
			{ kind: 'call-name-is', value: 'say' },
			{ kind: 'argument-equals', path: 'text', value: 'the code is 7-4-2' }
		]
	}
};

const eventuallyGreets: AssertionCard = {
	id: 'testbench/eventually-greets',
	title: 'Says hello at least once',
	schemaVersion: 1,
	quantifier: 'at-least-once',
	when: {
		kind: 'and',
		all: [
			{ kind: 'call-name-is', value: 'say' },
			{ kind: 'argument-equals', path: 'text', value: 'hello' }
		]
	}
};

describe('evaluateAssertion', () => {
	it('passes a never-quantifier card when no call in the run matches', () => {
		const events = [acted('say', { text: 'hello' }, 1), acted('move', { to: 'north' }, 2)];
		const result = evaluateAssertion(neverSaysSecret, events);
		expect(result.pass).toBe(true);
		expect(result.matches).toEqual([]);
	});

	it('fails a never-quantifier card the moment one call matches', () => {
		const events = [
			acted('say', { text: 'hello' }, 1),
			acted('say', { text: 'the code is 7-4-2' }, 2)
		];
		const result = evaluateAssertion(neverSaysSecret, events);
		expect(result.pass).toBe(false);
		expect(result.matches).toEqual([{ tick: 2, kind: 'action', name: 'say' }]);
	});

	it('passes an at-least-once card only once a matching call actually ran', () => {
		expect(evaluateAssertion(eventuallyGreets, []).pass).toBe(false);
		expect(evaluateAssertion(eventuallyGreets, [acted('say', { text: 'hello' }, 1)]).pass).toBe(
			true
		);
	});

	it('reads tool.executed the same way as action.performed', () => {
		const card: AssertionCard = {
			id: 'testbench/uses-calculator',
			title: 'Uses the calculator at least once',
			schemaVersion: 1,
			quantifier: 'at-least-once',
			when: { kind: 'call-name-is', value: 'calculator' }
		};
		const result = evaluateAssertion(card, [used('calculator', { expression: '2+2' }, 3)]);
		expect(result.pass).toBe(true);
		expect(result.matches).toEqual([{ tick: 3, kind: 'tool', name: 'calculator' }]);
	});

	it('ignores a call a guardrail blocked — only what actually ran counts', () => {
		// `decision` fires for every call attempt, blocked or not; a blocked
		// action never reaches `action.performed`, so a card asking "did the bot
		// touch the snack" must not count the attempt as touching it.
		const events = [decided('say', { text: 'the code is 7-4-2' }, 1)];
		expect(evaluateAssertion(neverSaysSecret, events).pass).toBe(true);
	});
});

describe('runTestBench', () => {
	it('runs every card in order and reports each independently', () => {
		const events = [acted('say', { text: 'hello' }, 1)];
		const results = runTestBench([neverSaysSecret, eventuallyGreets], events);
		expect(results.map((r) => [r.card.id, r.pass])).toEqual([
			['testbench/never-says-secret', true],
			['testbench/eventually-greets', true]
		]);
	});
});
