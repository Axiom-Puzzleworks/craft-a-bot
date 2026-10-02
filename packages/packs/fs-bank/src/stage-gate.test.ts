import { describe, expect, it } from 'vitest';
import { compilePolicyCard } from '@craftabot/governance';
import { policyCardSchema, type GuardrailContext } from '@craftabot/core';
import { stageGateCard } from './stage-gate.js';

/**
 * **A stage gate** (WP137, `110-CONTROL-SUITE-PLAN.md` §6): at the held
 * stage's input, a block until every named predicate holds over the desk's
 * state; an allow once they do; and silence anywhere else.
 */
const CARD = stageGateCard({
	id: 'test/policy/payout-waits-for-the-file',
	title: 'Payout waits for the file',
	stageId: 'payout',
	requires: ['verified', 'decided'],
	reason: 'No payout until the file shows the caller verified and a decision made.'
});

const atStageIn = (stageId: string, holds: readonly string[]): GuardrailContext =>
	({
		hook: 'pre-act',
		tick: 3,
		usage: { ticks: 3, inputTokens: 0, outputTokens: 0 },
		proposed: { kind: 'action', name: stageId, arguments: {} },
		worldState: {},
		history: [],
		world: { test: (id: string) => holds.includes(id), predicates: ['verified', 'decided'] },
		stage: { id: stageId, point: 'stage-in', input: {} }
	}) as unknown as GuardrailContext;

describe('stageGateCard', () => {
	const [guardrail] = compilePolicyCard(CARD);

	it('is a well-formed card with one pre-act rule', () => {
		expect(policyCardSchema.safeParse(CARD).success).toBe(true);
		expect(guardrail).toBeDefined();
	});

	it('blocks the stage while any precondition is missing, with the reason', async () => {
		for (const holds of [[], ['verified'], ['decided']]) {
			const verdict = await guardrail!.check(atStageIn('payout', holds));
			expect(verdict, holds.join(',') || 'none').toMatchObject({
				allow: false,
				disposition: 'block-action',
				reason: CARD.rules[0]!.reason
			});
		}
	});

	it('lets the stage through once the file shows every precondition', async () => {
		expect(await guardrail!.check(atStageIn('payout', ['verified', 'decided']))).toMatchObject({
			allow: true
		});
	});

	it('says nothing about any other stage or call', async () => {
		expect(await guardrail!.check(atStageIn('decision', []))).toMatchObject({ allow: true });
	});
});
