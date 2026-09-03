import { describe, expect, it } from 'vitest';
import { evalFixtures } from '../fixtures/eval/index.js';
import { normaliseScore, readEvalResponse } from './reading.js';

describe('readEvalResponse', () => {
	it('reads each metric’s own result, with its confidence when there is one', () => {
		expect(readEvalResponse(evalFixtures['safety-safe'], 'safety')).toEqual({
			outcome: 'ok',
			score: 1,
			explanation: expect.stringContaining('no harmful'),
			confidence: 0.98
		});
		expect(readEvalResponse(evalFixtures['fulfillment-low'], 'fulfillment')).toMatchObject({
			outcome: 'ok',
			score: 1
		});
		expect(readEvalResponse(evalFixtures['pointwise'], 'rubric')).toEqual({
			outcome: 'ok',
			score: 4,
			explanation: expect.stringContaining('4 of 5')
		});
	});

	it('is partial when the answer carries another metric, no result, or no shape it reads', () => {
		expect(readEvalResponse(evalFixtures['safety-safe'], 'fulfillment')).toMatchObject({
			outcome: 'partial',
			explanation: expect.stringContaining('without a fulfillment result')
		});
		expect(readEvalResponse({}, 'safety').outcome).toBe('partial');
		expect(readEvalResponse('nonsense', 'safety').outcome).toBe('partial');
		expect(readEvalResponse({ safetyResult: { score: 'high' } }, 'safety').outcome).toBe('partial');
	});
});

describe('normaliseScore', () => {
	it('keeps safety, maps fulfillment’s 1..5 onto 0..1, divides a rubric by its scale, and clamps', () => {
		expect(normaliseScore('safety', 1, 5)).toBe(1);
		expect(normaliseScore('safety', 0, 5)).toBe(0);
		expect(normaliseScore('fulfillment', 1, 5)).toBe(0);
		expect(normaliseScore('fulfillment', 5, 5)).toBe(1);
		expect(normaliseScore('fulfillment', 3, 5)).toBe(0.5);
		expect(normaliseScore('rubric', 4, 5)).toBe(0.8);
		expect(normaliseScore('rubric', 12, 10)).toBe(1);
		expect(normaliseScore('safety', -1, 5)).toBe(0);
	});
});
