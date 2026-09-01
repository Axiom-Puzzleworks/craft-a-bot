import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { decisionText, observationText, resultText } from './text.js';

let counter = 0;
function envelope(): { id: string; runId: string; tick: number; timestamp: string } {
	counter += 1;
	return {
		id: `00000000-0000-0000-0000-${String(counter).padStart(12, '0')}`,
		runId: '00000000-0000-0000-0000-000000000000',
		tick: counter,
		timestamp: new Date(0).toISOString()
	};
}

function senseEvent(text: string): EngineEvent {
	return {
		...envelope(),
		type: 'sense',
		payload: { channels: ['sight'], observation: { channels: ['sight'], text } }
	};
}

function decisionEvent(thought: string): EngineEvent {
	return { ...envelope(), type: 'decision', payload: { thought, call: null } };
}

function actionPerformedEvent(narration: string): EngineEvent {
	return {
		...envelope(),
		type: 'action.performed',
		payload: { name: 'move', arguments: {}, result: { ok: true, narration } }
	};
}

function toolExecutedEvent(result: unknown): EngineEvent {
	return {
		...envelope(),
		type: 'tool.executed',
		payload: { name: 'dice', arguments: {}, result, durationMs: 1 }
	};
}

describe('observationText', () => {
	it("returns the last sense event's observation text", () => {
		const history = [senseEvent('a rug and a lamp'), decisionEvent('I should look around')];
		expect(observationText(history)).toBe('a rug and a lamp');
	});

	it('returns undefined with no sense event in history', () => {
		expect(observationText([decisionEvent('thinking')])).toBeUndefined();
	});

	it('picks the most recent sense event when there are several', () => {
		const history = [senseEvent('first'), senseEvent('second')];
		expect(observationText(history)).toBe('second');
	});
});

describe('decisionText', () => {
	it("combines the last decision's thought with a string-argument call", () => {
		const history = [senseEvent('a teddy on the rug'), decisionEvent('I should say hello')];
		const screen = decisionText(history, { kind: 'action', name: 'say', arguments: 'hello!' });
		expect(screen?.text).toBe('I should say hello\nsay("hello!")');
		expect(screen?.userPrompt).toBe('a teddy on the rug');
	});

	it('renders an object-argument call without quoting string values', () => {
		const history = [decisionEvent('give the teddy a snack')];
		const screen = decisionText(history, {
			kind: 'action',
			name: 'give',
			arguments: { character: 'teddy', item: 'snack' }
		});
		expect(screen?.text).toBe('give the teddy a snack\ngive(character: teddy, item: snack)');
	});

	it('renders a no-argument call', () => {
		const history = [decisionEvent('wait a moment')];
		const screen = decisionText(history, { kind: 'action', name: 'wait', arguments: undefined });
		expect(screen?.text).toBe('wait a moment\nwait()');
	});

	it('returns undefined when there is nothing proposed', () => {
		const history = [decisionEvent('thinking')];
		expect(decisionText(history, undefined)).toBeUndefined();
	});

	it('returns undefined when there is no decision to screen (a reflex tick with no decision)', () => {
		const history = [senseEvent('a rug')];
		expect(
			decisionText(history, { kind: 'action', name: 'wait', arguments: undefined })
		).toBeUndefined();
	});

	it('omits userPrompt when there has been no observation yet', () => {
		const history = [decisionEvent('thinking')];
		const screen = decisionText(history, { kind: 'tool', name: 'dice', arguments: {} });
		expect(screen?.userPrompt).toBeUndefined();
	});
});

describe('resultText', () => {
	it('reads the last action.performed narration', () => {
		const history = [toolExecutedEvent('rolled a 4'), actionPerformedEvent('You moved north.')];
		expect(resultText(history)).toBe('You moved north.');
	});

	it('reads the newer of the two when a tool executed after the last action', () => {
		const history = [actionPerformedEvent('You moved north.'), toolExecutedEvent('rolled a 4')];
		expect(resultText(history)).toBe('rolled a 4');
	});

	it('stringifies a structured tool result', () => {
		const history = [toolExecutedEvent({ total: 4, dice: [4] })];
		expect(resultText(history)).toBe(JSON.stringify({ total: 4, dice: [4] }));
	});

	it('returns undefined with neither event in history', () => {
		expect(resultText([senseEvent('a rug'), decisionEvent('thinking')])).toBeUndefined();
	});
});
