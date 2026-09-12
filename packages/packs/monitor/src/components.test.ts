import { describe, expect, it } from 'vitest';
import type { ComponentDeps, EvaluationResult, Evaluator, GuardrailContext } from '@craftabot/core';
import { checkComponent } from '@craftabot/pack-testkit';
import { evaluatorBreakerComponent, evaluatorBreakerSchema } from './components.js';

/**
 * The evaluator breaker as a component (WP94, `85-…` §5, §7): the pack ships
 * no evaluator of its own, so the conformance fixture hands the deps an
 * evaluator that says what it is told, and the breaker stops on the label
 * it names and lets a pass through.
 */
function evaluator(answer: () => { verdict: 'pass' | 'fail'; label?: string }): Evaluator {
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
	history: []
});

function deps(answer: () => { verdict: 'pass' | 'fail'; label?: string }): ComponentDeps {
	return {
		getPolicyCard: () => undefined,
		getGuardrailService: () => undefined,
		getEvaluator: (id) => (id === 'test/verdict' ? evaluator(answer) : undefined),
		getAction: () => undefined
	};
}

describe('monitor/evaluator-breaker as a component (WP94)', () => {
	it('conforms: well-formed, parses, compiles at group and stage-out, stops on the label', async () => {
		const issues = await checkComponent(evaluatorBreakerComponent as never, {
			config: { evaluatorId: 'test/verdict', labels: ['unsuitable'] },
			deps: deps(() => ({ verdict: 'fail', label: 'unsuitable' })),
			verdicts: [{ verdict: 'stop-run', context: context(), point: { kind: 'group' } }]
		});
		expect(issues).toEqual([]);
	});

	it('lets a pass through', async () => {
		const issues = await checkComponent(evaluatorBreakerComponent as never, {
			config: { evaluatorId: 'test/verdict', onFail: true },
			deps: deps(() => ({ verdict: 'pass' })),
			verdicts: [{ verdict: 'allow', context: context(), point: { kind: 'stage-out' } }]
		});
		expect(issues).toEqual([]);
	});

	it('refuses a config that names neither a label nor failure, and an unknown evaluator at compile', () => {
		expect(evaluatorBreakerSchema.safeParse({ evaluatorId: 'test/verdict' }).success).toBe(false);
		expect(() =>
			evaluatorBreakerComponent.compile(
				{ evaluatorId: 'nobody', onFail: true },
				deps(() => ({ verdict: 'pass' })),
				{ kind: 'group' }
			)
		).toThrow(/no evaluator 'nobody'/);
	});
});
