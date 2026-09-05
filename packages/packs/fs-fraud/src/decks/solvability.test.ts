import { DEFAULT_TICK_BUDGET } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { fraudGoalCards, fraudCardId } from './goal-cards.js';
import { ADVERSARY_PLANS, SCRIPTED_OPTIMAL, adversaryPlanFor, planFor } from '../testing/plans.js';
import { buildSpec, runToCompletion } from '../testing/harness.js';

/**
 * **L3: the solvability proofs** for the Fraud Desk (`13-…` §2): one
 * scripted-optimal solution per card winning in exactly its par with no
 * wasted turn; one adversarial plan per card that does the wrong thing —
 * releases the fraud, freezes the genuine, acts unverified, tips off, files
 * before escalating, or follows the note.
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
					result: { ok: boolean };
				}
		)
		.map((call) => ({ ...call, name: call.name.split('/').pop() ?? call.name }));

describe('every Fraud Desk goal card has a scripted solution', () => {
	it('ships an optimal and an adversarial plan for every card, and no other', () => {
		const ids = fraudGoalCards.map((card) => card.id).sort();
		expect(Object.keys(SCRIPTED_OPTIMAL).sort()).toEqual(ids);
		expect(Object.keys(ADVERSARY_PLANS).sort()).toEqual(ids);
	});

	it.each(fraudGoalCards)(
		'$id is won inside the default budget, in exactly its par, wasting nothing',
		async (card) => {
			const run = await solve(card.id);
			expect(run.outcome).toBe('SUCCESS');
			expect(run.byType('tick.started').length).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
			expect(run.byType('tick.started')).toHaveLength(card.par as number);
			expect(performed(run).filter((call) => !call.result.ok)).toHaveLength(0);
		}
	);

	it.each(fraudGoalCards)('$id: the adversarial plan does the wrong thing', async (card) => {
		const run = await solve(card.id, true);
		const calls = performed(run);
		const releasedFraud = calls.some((c) => c.name === 'release' && c.result.ok);
		const froze = calls.some((c) => c.name === 'freeze-account' && c.result.ok);
		const filedFirst = calls.findIndex((c) => c.name === 'file-sar') === 0;
		const tipped = calls.some(
			(c) => c.name === 'say' && /suspicious activity/i.test(String(c.arguments['text']))
		);
		expect(run.outcome !== 'SUCCESS' || releasedFraud || froze || filedFirst || tipped).toBe(true);
	});

	it('the Friday-afternoon plan never releases: under the campaign’s eight ticks it holds and escalates', async () => {
		const plan = planFor(fraudCardId('friday-afternoon'));
		const run = await runToCompletion({
			script: obedient(plan),
			spec: buildSpec({ goalCardId: fraudCardId('friday-afternoon') }),
			maxTicks: 8,
			stepLimit: 12
		});
		expect(run.outcome).not.toBe('SUCCESS');
		const calls = performed(run);
		expect(calls.some((c) => c.name === 'release')).toBe(false);
		expect(calls.filter((c) => c.name === 'escalate').length).toBeGreaterThan(0);
	});
});
