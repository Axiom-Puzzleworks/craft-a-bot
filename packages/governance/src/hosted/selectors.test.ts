import { describe, expect, it } from 'vitest';
import {
	decisionSelector,
	observationSelector,
	renderCall,
	resultSelector,
	stringifyToolResult
} from './selectors.js';
import {
	actionPerformedEvent,
	context,
	decisionEvent,
	senseEvent,
	toolExecutedEvent
} from './test-service.js';

const PROPOSED = {
	kind: 'action' as const,
	name: 'give',
	arguments: { character: 'teddy', item: 'snack' }
};

describe('observationSelector', () => {
	it("prefers the context's observation, falls back to the last sense event, else nothing", () => {
		expect(observationSelector(context('pre-think', { observation: 'live' }))).toEqual({
			text: 'live'
		});
		expect(
			observationSelector(context('pre-think', { history: [senseEvent('old'), senseEvent('new')] }))
		).toEqual({ text: 'new' });
		expect(observationSelector(context('pre-think'))).toBeUndefined();
	});
});

describe('decisionSelector', () => {
	it('needs a proposed call and a thought — from the response first, then the last decision', () => {
		expect(decisionSelector(context('pre-act'))).toBeUndefined();
		expect(decisionSelector(context('pre-act', { proposed: PROPOSED }))).toBeUndefined();
		expect(
			decisionSelector(
				context('pre-act', {
					proposed: PROPOSED,
					response: 'fresh thought',
					history: [decisionEvent('stale')]
				})
			)
		).toEqual({ text: 'fresh thought\ngive(character: teddy, item: snack)' });
		expect(
			decisionSelector(
				context('pre-act', {
					proposed: PROPOSED,
					history: [senseEvent('a ball'), decisionEvent('stale')]
				})
			)
		).toEqual({ text: 'stale\ngive(character: teddy, item: snack)', context: 'a ball' });
	});
});

describe('resultSelector', () => {
	it('takes the newer of the last narration and the last tool result, else nothing', () => {
		expect(resultSelector(context('post-act'))).toBeUndefined();
		expect(
			resultSelector(
				context('post-act', {
					history: [actionPerformedEvent('You moved.'), toolExecutedEvent({ roll: 4 })]
				})
			)
		).toEqual({ text: '{"roll":4}' });
		expect(
			resultSelector(
				context('post-act', {
					history: [toolExecutedEvent('six'), actionPerformedEvent('You moved.')]
				})
			)
		).toEqual({ text: 'You moved.' });
		expect(resultSelector(context('post-act', { history: [senseEvent('x')] }))).toBeUndefined();
	});
});

describe('renderCall', () => {
	it('renders no args, a string, an object of args and anything else', () => {
		expect(renderCall('look', undefined)).toBe('look()');
		expect(renderCall('look', null)).toBe('look()');
		expect(renderCall('say', 'go north')).toBe('say("go north")');
		expect(renderCall('give', { character: 'teddy', count: 2 })).toBe(
			'give(character: teddy, count: 2)'
		);
		expect(renderCall('roll', 6)).toBe('roll(6)');
	});
});

describe('stringifyToolResult', () => {
	it('passes strings through, stringifies objects, and survives what JSON cannot', () => {
		expect(stringifyToolResult('six')).toBe('six');
		expect(stringifyToolResult({ a: 1 })).toBe('{"a":1}');
		expect(stringifyToolResult(10n)).toBe('10');
	});
});
