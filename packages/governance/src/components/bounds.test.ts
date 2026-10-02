import type { ComponentDeps } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { action, context, tool } from '../test-context.js';
import {
	argumentProblems,
	argumentValidationComponent,
	costCapComponent,
	spentUsd
} from './bounds.js';

/**
 * WP148 (`110-CONTROL-SUITE-PLAN.md` §10): the cost cap stops a run once its
 * tokens at list price pass the cap; argument validation refuses an action
 * whose arguments do not fit the schema the world declares.
 */
const PRICES = { inputPerMillion: 2.5, outputPerMillion: 10, priceSource: 'a stated price' };
const deps = (parameters?: unknown): ComponentDeps => ({
	getPolicyCard: () => undefined,
	getGuardrailService: () => undefined,
	getEvaluator: () => undefined,
	getAction: (name) =>
		name === 'decide' && parameters !== undefined ? ({ parameters } as never) : undefined
});

describe('the cost cap (WP148)', () => {
	it('lets a run through under its cap and stops it at the cap', () => {
		expect(spentUsd({ inputTokens: 1_000_000, outputTokens: 100_000 }, PRICES)).toBe(3.5);
		const [cap] = costCapComponent.compile({ usdCap: 1, ...PRICES }, deps(), { kind: 'pre-think' });
		expect(
			cap!.check(context({ usage: { ticks: 1, inputTokens: 100_000, outputTokens: 10_000 } }))
		).toMatchObject({ allow: true });
		expect(
			cap!.check(context({ usage: { ticks: 9, inputTokens: 300_000, outputTokens: 30_000 } }))
		).toMatchObject({ allow: false, disposition: 'stop-run' });
		expect(costCapComponent.explain({ usdCap: 1, ...PRICES })).toContain('$1.00');
	});
});

describe('tool-argument validation (WP148)', () => {
	const schema = {
		type: 'object',
		required: ['outcome', 'reasons'],
		properties: {
			outcome: { type: 'string', enum: ['approve', 'decline'] },
			reasons: { type: 'array', items: { type: 'string' } },
			amount: { type: 'number' }
		}
	};

	it('names each problem with its path', () => {
		expect(argumentProblems({ outcome: 'approve', reasons: ['x'], amount: 3 }, schema)).toEqual([]);
		expect(argumentProblems({ outcome: 'maybe', reasons: [1] }, schema)).toEqual([
			'arguments.outcome is not one of "approve", "decline"',
			'arguments.reasons[0] is number, not string'
		]);
		expect(argumentProblems({ outcome: 'approve' }, schema)).toEqual([
			'arguments.reasons is missing'
		]);
		expect(argumentProblems('text', schema)).toEqual(['arguments is string, not object']);
		expect(argumentProblems(null, { type: ['object', 'null'] })).toEqual([]);
	});

	it('refuses an action that does not fit, and leaves tools and undeclared actions alone', () => {
		const [check] = argumentValidationComponent.compile({}, deps(schema), { kind: 'pre-act' });
		expect(
			check!.check(
				context({ hook: 'pre-act', proposed: action('decide', { outcome: 'maybe', reasons: [] }) })
			)
		).toMatchObject({ allow: false, disposition: 'block-action' });
		expect(
			check!.check(
				context({
					hook: 'pre-act',
					proposed: action('decide', { outcome: 'approve', reasons: ['score-good'] })
				})
			)
		).toEqual({ allow: true });
		expect(check!.check(context({ hook: 'pre-act', proposed: tool('decide', {}) }))).toEqual({
			allow: true
		});
		expect(check!.check(context({ hook: 'pre-act', proposed: action('say', {}) }))).toEqual({
			allow: true
		});
		expect(check!.check(context({ hook: 'pre-act' }))).toEqual({ allow: true });
		expect(argumentValidationComponent.explain({})).toContain('declared schema');
	});
});
