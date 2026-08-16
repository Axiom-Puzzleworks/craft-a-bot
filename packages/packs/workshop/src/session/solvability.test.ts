import { DEFAULT_TICK_BUDGET } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { workshopGoalCards } from '../goal-cards.js';
import { SCRIPTED_OPTIMAL, planFor } from './plans.js';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **L3: the solvability proofs** (`13-…` §2), for the Workshop — mirroring
 * `pack-starter/session/solvability.test.ts`. One scripted-optimal solution
 * per goal card, run through the real session over the real Workshop,
 * proving both that every card *can* be won, and can be won inside the
 * budget a player actually gets.
 */

async function solve(goalCardId: string) {
	const plan = planFor(goalCardId);
	return runToCompletion({
		script: obedient(plan),
		spec: buildSpec({ goalCardId }),
		stepLimit: plan.length + 5
	});
}

describe('every Workshop goal card has a scripted solution', () => {
	it('ships a plan for every card in the pack', () => {
		expect(Object.keys(SCRIPTED_OPTIMAL).sort()).toEqual(
			workshopGoalCards.map((card) => card.id).sort()
		);
	});

	it.each(workshopGoalCards)('$id is won inside the default budget', async (card) => {
		const run = await solve(card.id);
		expect(run.outcome).toBe('SUCCESS');
		expect(run.byType('tick.started').length).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
	});

	it.each(workshopGoalCards.filter((card) => card.par !== undefined))(
		'$id takes exactly the par it advertises',
		async (card) => {
			const run = await solve(card.id);
			expect(run.byType('tick.started')).toHaveLength(card.par as number);
		}
	);

	it('does not waste a single turn: every action in an optimal plan works', async () => {
		for (const card of workshopGoalCards) {
			const run = await solve(card.id);
			const failed = run
				.byType('action.performed')
				.filter((event) => !(event.payload as { result: { ok: boolean } }).result.ok);
			expect(failed, `${card.id} wasted a turn`).toHaveLength(0);
		}
	});
});
