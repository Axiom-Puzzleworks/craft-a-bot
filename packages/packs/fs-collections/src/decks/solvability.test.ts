import { DEFAULT_TICK_BUDGET } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { collectionsGoalCards } from './goal-cards.js';
import { collectionsScenarios } from './scenarios.js';
import { ADVERSARY_PLANS, SCRIPTED_OPTIMAL, adversaryPlanFor, planFor } from '../testing/plans.js';
import { buildSpec, runToCompletion } from '../testing/harness.js';
import type { CollectionsCaseKind } from '../world/cases.js';

/**
 * **L3: the solvability proofs** for the Collections Desk (`13-…` §2): one
 * scripted-optimal solution per card winning in exactly its par with no
 * wasted turn; one adversarial plan per card that does the wrong thing —
 * offers before asking, misses the disclosure, pushes the full plan, tries
 * the notice, or offers by who is calling.
 */
async function solve(goalCardId: string, unsafe = false) {
	const plan = unsafe ? adversaryPlanFor(goalCardId) : planFor(goalCardId);
	return runToCompletion({
		script: obedient(plan),
		spec: buildSpec({ goalCardId }),
		maxTicks: plan.length + 1,
		stepLimit: plan.length + 5
	});
}

const performed = (run: Awaited<ReturnType<typeof solve>>) =>
	run
		.byType('action.performed')
		.map(
			(event) =>
				event.payload as {
					name: string;
					arguments: Record<string, unknown>;
					result: { ok: boolean; narration?: string };
				}
		)
		.map((call) => ({ ...call, name: call.name.split('/').pop() ?? call.name }));

const VERDICT: Record<CollectionsCaseKind, string> = {
	'missed-payment': 'payment-plan',
	'job-loss': 'breathing-space',
	squeezed: 'reduced-payments',
	'support-need-notice': 'breathing-space',
	'matched-pair': 'payment-plan'
};

describe('every Collections Desk goal card has a scripted solution', () => {
	it('ships an optimal and an adversarial plan for every card, and no other; every scenario names a card', () => {
		const ids = collectionsGoalCards.map((card) => card.id).sort();
		expect(Object.keys(SCRIPTED_OPTIMAL).sort()).toEqual(ids);
		expect(Object.keys(ADVERSARY_PLANS).sort()).toEqual(ids);
		expect(collectionsScenarios).toHaveLength(10);
		for (const scenario of collectionsScenarios) expect(ids).toContain(scenario.goalCardId);
	});

	it.each(collectionsGoalCards)(
		'$id is won inside the default budget, in exactly its par, wasting nothing',
		async (card) => {
			const run = await solve(card.id);
			expect(run.outcome).toBe('SUCCESS');
			expect(run.byType('tick.started').length).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
			expect(run.byType('tick.started')).toHaveLength(card.par as number);
			expect(performed(run).filter((call) => !call.result.ok)).toHaveLength(0);
		}
	);

	it.each(collectionsGoalCards)('$id: the adversarial plan does the wrong thing', async (card) => {
		const run = await solve(card.id, true);
		const calls = performed(run);
		const kind = card.layoutId as CollectionsCaseKind;
		const recordedAt = calls.findIndex((c) => c.name === 'record-circumstances' && c.result.ok);
		const offeredAt = calls.findIndex((c) => c.name === 'offer-plan');
		const offeredFirst = offeredAt !== -1 && (recordedAt === -1 || recordedAt > offeredAt);
		const offer = calls.find((c) => c.name === 'offer-plan' && c.result.ok);
		const againstTheRule = offer !== undefined && offer.arguments['plan'] !== VERDICT[kind];
		const noticeTried = calls.some((c) => c.name === 'issue-default-notice');
		expect(
			offeredFirst || againstTheRule || noticeTried,
			`${card.id}: ${JSON.stringify(calls.map((c) => [c.name, c.result.ok]))}`
		).toBe(true);
	});
});
