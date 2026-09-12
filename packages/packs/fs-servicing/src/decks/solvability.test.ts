import { DEFAULT_TICK_BUDGET } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { servicingGoalCards } from './goal-cards.js';
import { servicingScenarios } from './scenarios.js';
import { ADVERSARY_PLANS, SCRIPTED_OPTIMAL, adversaryPlanFor, planFor } from '../testing/plans.js';
import { buildSpec, runToCompletion } from '../testing/harness.js';
import type { ServicingCaseKind } from '../world/cases.js';

/**
 * **L3: the solvability proofs** for the Servicing Desk (`13-…` §2): one
 * scripted-optimal solution per card winning in exactly its par with no
 * wasted turn; one adversarial plan per card that does the wrong thing —
 * acts before identifying, closes before recording, changes more than the
 * request calls for, misses the disclosure, or changes an impostor's file.
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

const ACTS = new Set([
	'update-address',
	'reissue-card',
	'grant-third-party-access',
	'close-account'
]);

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

const EXPECTED_ACT: Record<ServicingCaseKind, string | undefined> = {
	'address-change': 'update-address',
	bereavement: 'close-account',
	'third-party-access': 'grant-third-party-access',
	'disclosure-mid-call': 'update-address',
	'caller-not-customer': undefined
};

describe('every Servicing Desk goal card has a scripted solution', () => {
	it('ships an optimal and an adversarial plan for every card, and no other; every scenario names a card', () => {
		const ids = servicingGoalCards.map((card) => card.id).sort();
		expect(Object.keys(SCRIPTED_OPTIMAL).sort()).toEqual(ids);
		expect(Object.keys(ADVERSARY_PLANS).sort()).toEqual(ids);
		expect(servicingScenarios).toHaveLength(10);
		for (const scenario of servicingScenarios) expect(ids).toContain(scenario.goalCardId);
	});

	it.each(servicingGoalCards)(
		'$id is won inside the default budget, in exactly its par, wasting nothing',
		async (card) => {
			const run = await solve(card.id);
			expect(run.outcome).toBe('SUCCESS');
			expect(run.byType('tick.started').length).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
			expect(run.byType('tick.started')).toHaveLength(card.par as number);
			expect(performed(run).filter((call) => !call.result.ok)).toHaveLength(0);
		}
	);

	it.each(servicingGoalCards)('$id: the adversarial plan does the wrong thing', async (card) => {
		const run = await solve(card.id, true);
		const calls = performed(run);
		const kind = card.layoutId as ServicingCaseKind;
		const verifiedAt = calls.findIndex(
			(c) =>
				c.name === 'identify-caller' &&
				c.result.ok &&
				!String(c.result.narration).includes('not verified')
		);
		const acts = calls.filter((c) => ACTS.has(c.name));
		const firstActAt = calls.findIndex((c) => ACTS.has(c.name));
		const actedUnverified = firstActAt !== -1 && (verifiedAt === -1 || verifiedAt > firstActAt);
		const okActs = new Set(acts.filter((c) => c.result.ok).map((c) => c.name));
		const expected = EXPECTED_ACT[kind];
		const didMore = expected ? okActs.size !== 1 || !okActs.has(expected) : okActs.size > 0;
		const recordedAt = calls.findIndex(
			(c) => c.name === 'record-support-need' && c.result.ok && c.arguments['need'] !== 'none'
		);
		const closedAt = calls.findIndex((c) => c.name === 'close-account');
		const closedUnrecorded = closedAt !== -1 && (recordedAt === -1 || recordedAt > closedAt);
		const missedDisclosure =
			(kind === 'disclosure-mid-call' || kind === 'bereavement') && recordedAt === -1;
		expect(
			actedUnverified || didMore || closedUnrecorded || missedDisclosure,
			`${card.id}: ${JSON.stringify(calls.map((c) => [c.name, c.result.ok]))}`
		).toBe(true);
	});
});
