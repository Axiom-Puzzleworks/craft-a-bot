import type { EngineEvent, EvaluationInput, Evaluator } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { evaluationInputFor, inputReadableBy } from './evaluators.js';

/**
 * WP54 stage A (`45-TRUTH-SYNTHETIC.md` §4.1): the one place truth crosses
 * from a trace to an evaluator, and the gate every run path applies.
 */
function event(type: EngineEvent['type'], payload: unknown, tick = 0): EngineEvent {
	return {
		id: `${type}-${tick}`,
		runId: '11111111-1111-4111-8111-111111111111',
		tick,
		timestamp: '2026-09-05T09:00:00.000Z',
		type,
		payload
	} as unknown as EngineEvent;
}

const started = event('run.started', {
	specSnapshot: {},
	worldId: 'w',
	layoutId: 'l',
	goalCardId: 'g',
	mode: 'step'
});
const finishedWith = (truth?: unknown) =>
	event(
		'run.finished',
		{
			outcome: 'SUCCESS',
			ticks: 1,
			usage: { inputTokens: 0, outputTokens: 0 },
			...(truth !== undefined ? { truth } : {})
		},
		1
	);

describe('evaluationInputFor and truth', () => {
	it('lifts truth from run.finished and nothing else', () => {
		const input = evaluationInputFor([started, finishedWith({ answer: 42 })]);
		expect(input.truth).toEqual({ answer: 42 });
	});

	it('has no truth key at all when the run has none, or has not finished', () => {
		expect('truth' in evaluationInputFor([started, finishedWith()])).toBe(false);
		expect('truth' in evaluationInputFor([started])).toBe(false);
	});
});

describe('inputReadableBy', () => {
	const input: EvaluationInput = {
		...evaluationInputFor([started, finishedWith({ answer: 42 })])
	};
	const reader: Pick<Evaluator, 'reads'> = { reads: ['truth'] };
	const blind: Pick<Evaluator, 'reads'> = {};

	it('keeps truth for an evaluator that declares it', () => {
		expect(inputReadableBy(reader, input)).toBe(input);
	});

	it('removes the key — not merely the value — for one that does not', () => {
		const stripped = inputReadableBy(blind, input);
		expect('truth' in stripped).toBe(false);
		expect(stripped.run).toBe(input.run);
		expect(stripped.events).toBe(input.events);
		// The caller's input is untouched.
		expect(input.truth).toEqual({ answer: 42 });
	});
});
