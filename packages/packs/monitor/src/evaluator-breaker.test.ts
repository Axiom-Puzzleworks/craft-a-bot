import { describe, expect, it } from 'vitest';
import type { EngineEvent, EvaluationResult, Evaluator, GuardrailContext } from '@craftabot/core';
import { createComplianceWatchbot, createEvaluatorCircuitBreaker } from './rules.js';

/**
 * The breaker on an evaluator's verdict (WP64, `56-…` §4.3): stops the
 * group on a named label or, when asked, on a fail; lets a pass, an
 * inconclusive verdict and any other label through; notes, never stops,
 * when the evaluator throws. The Compliance Watchbot composes it with the
 * group Watchbot.
 */
function evaluator(
	answer: () => { verdict: 'pass' | 'fail' | 'inconclusive'; label?: string }
): Evaluator {
	return {
		id: 'test/verdict',
		name: 'Verdict',
		description: 'Says what it is told.',
		kind: 'deterministic',
		evaluate: () => {
			const { verdict, label } = answer();
			const result: EvaluationResult = {
				evaluatorId: 'test/verdict',
				verdict,
				explanation: `it is ${label ?? verdict}`,
				evidence: [],
				...(label !== undefined ? { label } : {})
			};
			return Promise.resolve(result);
		}
	};
}

const context = (): GuardrailContext => ({
	hook: 'pre-think',
	tick: 1,
	spec: { id: 'g', name: 'group', goalCardId: '', schemaVersion: 1 } as never,
	usage: { ticks: 1, inputTokens: 0, outputTokens: 0 },
	worldState: {},
	history: [] as EngineEvent[]
});

describe('createEvaluatorCircuitBreaker (WP64)', () => {
	it('stops the group on a named label, with the evaluator’s own words', async () => {
		const breaker = createEvaluatorCircuitBreaker(
			evaluator(() => ({ verdict: 'fail', label: 'unsuitable' })),
			{ labels: ['unsuitable'] }
		);
		const verdict = await breaker.check(context());
		expect(verdict).toMatchObject({
			allow: false,
			disposition: 'stop-run',
			reason: expect.stringContaining('unsuitable')
		});
		expect(breaker.hooks).toEqual(['pre-think']);
	});

	it('lets a pass, an inconclusive verdict and another label through, and only fails stop when onFail', async () => {
		for (const answer of [
			{ verdict: 'pass' as const, label: 'suitable' },
			{ verdict: 'inconclusive' as const },
			{ verdict: 'fail' as const, label: 'none' }
		]) {
			const breaker = createEvaluatorCircuitBreaker(
				evaluator(() => answer),
				{
					labels: ['unsuitable']
				}
			);
			expect(await breaker.check(context())).toMatchObject({ allow: true });
		}
		const onFail = createEvaluatorCircuitBreaker(
			evaluator(() => ({ verdict: 'fail' })),
			{
				onFail: true
			}
		);
		expect(await onFail.check(context())).toMatchObject({ allow: false, disposition: 'stop-run' });
		expect(
			await createEvaluatorCircuitBreaker(
				evaluator(() => ({ verdict: 'pass' })),
				{
					onFail: true
				}
			).check(context())
		).toMatchObject({ allow: true });
	});

	it('notes, never stops, when the evaluator throws', async () => {
		const breaker = createEvaluatorCircuitBreaker(
			{
				...evaluator(() => ({ verdict: 'pass' })),
				evaluate: () => Promise.reject(new Error('no truth here'))
			},
			{ labels: ['unsuitable'] }
		);
		expect(await breaker.check(context())).toMatchObject({
			allow: true,
			note: expect.stringContaining('no truth here')
		});
	});

	it('the Compliance Watchbot is the group Watchbot plus a breaker per evaluator', () => {
		const watchbot = createComplianceWatchbot({
			watchFor: ['monitor/going-in-circles'],
			refusalLimit: 3,
			breakOn: [
				{ evaluator: evaluator(() => ({ verdict: 'pass' })), labels: ['tipped-off'] },
				{ evaluator: { ...evaluator(() => ({ verdict: 'pass' })), id: 'test/other' }, onFail: true }
			]
		});
		expect(watchbot.guardrails.map((rule) => rule.id)).toEqual([
			'monitor/going-in-circles',
			'monitor/group-circuit-breaker',
			'monitor/evaluator-breaker:test/verdict',
			'monitor/evaluator-breaker:test/other'
		]);
		expect(typeof watchbot.observe).toBe('function');
	});
});
