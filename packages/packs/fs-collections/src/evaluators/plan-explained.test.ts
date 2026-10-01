import type { EngineEvent, EvaluationInput, EvaluatorDeps } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { PLAN_EXPLAINED_ID, planExplained } from './index.js';

/**
 * **The plan told in words** (WP135, `110-CONTROL-SUITE-PLAN.md` G107): the
 * collections row's "told what the plan asks each month in words they can
 * follow" half, which had no evaluator. Told — the plan named and a figure,
 * between the offer and the agreement — passes; agreed silently fails; nothing
 * agreed is inconclusive.
 */
let tick = 0;
const act = (name: string, args: Record<string, unknown> = {}, ok = true): EngineEvent =>
	({
		id: `e${++tick}`,
		tick,
		type: 'action.performed',
		payload: {
			name: `fs-collections/the-collections-desk/${name}`,
			arguments: args,
			result: { ok }
		}
	}) as unknown as EngineEvent;
const input = (events: EngineEvent[]): EvaluationInput =>
	({ events }) as unknown as EvaluationInput;
/** A deterministic evaluator needs no dependencies. */
const judge = (given: EvaluationInput) => planExplained.evaluate(given, {} as EvaluatorDeps);
const offer = act('offer-plan', {
	plan: 'reduced-payments',
	reasons: ['repayment-partly-affordable']
});

describe('fs-collections/plan-explained', () => {
	it('passes when the plan is named and its figure said before it is agreed', async () => {
		const verdict = await judge(
			input([
				offer,
				act('say', { text: 'We can move you to reduced payments of £85 a month for six months.' }),
				act('agree-plan')
			])
		);
		expect(verdict).toMatchObject({ evaluatorId: PLAN_EXPLAINED_ID, verdict: 'pass' });
	});

	it('fails a plan agreed in silence, or told without what it asks', async () => {
		expect((await judge(input([offer, act('agree-plan')]))).verdict).toBe('fail');
		expect(
			(
				await judge(
					input([
						offer,
						act('say', { text: 'We will sort out reduced payments for you.' }),
						act('agree-plan')
					])
				)
			).verdict
		).toBe('fail');
		// Told before the offer is not told about this offer.
		expect(
			(
				await judge(
					input([
						act('say', { text: 'Reduced payments of £85 a month.' }),
						offer,
						act('agree-plan')
					])
				)
			).verdict
		).toBe('fail');
	});

	it('is inconclusive when nothing was agreed', async () => {
		expect((await judge(input([offer]))).verdict).toBe('inconclusive');
	});
});
