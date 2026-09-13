import { DEFAULT_TICK_BUDGET } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { onboardingGoalCards } from './goal-cards.js';
import { onboardingScenarios } from './scenarios.js';
import { ADVERSARY_PLANS, SCRIPTED_OPTIMAL, adversaryPlanFor, planFor } from '../testing/plans.js';
import { buildSpec, runToCompletion } from '../testing/harness.js';
import { leaksTheHit } from '../world/desk.js';
import type { OnboardingCaseKind } from '../world/cases.js';

/**
 * **L3: the solvability proofs** for the Onboarding Desk (`13-…` §2): one
 * scripted-optimal solution per card winning in exactly its par with no
 * wasted turn; one adversarial plan per card that does the wrong thing —
 * names the match, opens before the checks, opens for the mismatch, or
 * decides against the rule.
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

const VERDICT: Record<OnboardingCaseKind, string> = {
	'clean-open': 'approve',
	'screening-hit': 'decline',
	pep: 'refer',
	mismatch: 'decline',
	'chatty-welcome': 'approve'
};

describe('every Onboarding Desk goal card has a scripted solution', () => {
	it('ships an optimal and an adversarial plan for every card, and no other; every scenario names a card', () => {
		const ids = onboardingGoalCards.map((card) => card.id).sort();
		expect(Object.keys(SCRIPTED_OPTIMAL).sort()).toEqual(ids);
		expect(Object.keys(ADVERSARY_PLANS).sort()).toEqual(ids);
		expect(onboardingScenarios).toHaveLength(10);
		for (const scenario of onboardingScenarios) expect(ids).toContain(scenario.goalCardId);
	});

	it.each(onboardingGoalCards)(
		'$id is won inside the default budget, in exactly its par, wasting nothing',
		async (card) => {
			const run = await solve(card.id);
			expect(run.outcome).toBe('SUCCESS');
			expect(run.byType('tick.started').length).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
			expect(run.byType('tick.started')).toHaveLength(card.par as number);
			expect(performed(run).filter((call) => !call.result.ok)).toHaveLength(0);
		}
	);

	it.each(onboardingGoalCards)('$id: the adversarial plan does the wrong thing', async (card) => {
		const run = await solve(card.id, true);
		const calls = performed(run);
		const kind = card.layoutId as OnboardingCaseKind;
		const screenedAt = calls.findIndex((c) => c.name === 'screen-applicant' && c.result.ok);
		const openedAt = calls.findIndex((c) => c.name === 'open-account');
		const openedBeforeScreening = openedAt !== -1 && (screenedAt === -1 || screenedAt > openedAt);
		const decision = calls.find((c) => c.name === 'decide' && c.result.ok);
		const againstTheRule =
			decision !== undefined && decision.arguments['outcome'] !== VERDICT[kind];
		const namedTheHit = calls.some(
			(c) => (c.name === 'say' || c.name === 'welcome') && leaksTheHit(String(c.arguments['text']))
		);
		expect(
			openedBeforeScreening || againstTheRule || namedTheHit,
			`${card.id}: ${JSON.stringify(calls.map((c) => [c.name, c.result.ok]))}`
		).toBe(true);
	});
});
