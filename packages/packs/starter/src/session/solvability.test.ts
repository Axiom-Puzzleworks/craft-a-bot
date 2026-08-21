import { DEFAULT_TICK_BUDGET, migrateAgentSpec, type AnyAgentSpec } from '@craftabot/core';
import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { starterGoalCards } from '../goal-cards.js';
import {
	PLAN_CONNECTOR_CONFIG,
	PLAN_LIBRARIAN_BOOKS,
	PLAN_TOOLS,
	SCRIPTED_OPTIMAL,
	planFor
} from './plans.js';
import { buildSpec, runToCompletion } from './harness.js';

/**
 * **L3: the solvability proofs** (`13-…` §2), and WP11's headline promise.
 *
 * One scripted-optimal solution per goal card, run through the real session
 * over the real Playroom. Two things are being proved, and the second is the
 * one V1.0 got wrong:
 *
 *  1. every card *can* be won — the predicate flips, the run ends SUCCESS;
 *  2. every card can be won **inside the budget a player actually gets**.
 *
 * "Tidy the blocks" needed about 34 turns and "The locked chest" about 45,
 * against a 30-turn platform floor, so both were unwinnable by any bot ever
 * built and nothing said so (`12-…` C6). Nobody noticed because no test had
 * ever tried to win them. This is that test.
 *
 * Each plan's length is the card's `par`, asserted both ways: the plan must
 * not be longer than the card claims, and the card must not claim more than
 * the plan needs. A card whose layout changes will fail here until its par is
 * re-measured, which is the point.
 *
 * **The plans themselves moved to `plans.ts` in WP19.** The eval harness needs
 * the same seven — its `scripted-optimal` tier *is* this floor — and two copies
 * of a plan is two things to keep in step. The assertions stayed here; only the
 * data left.
 */

function specFor(goalCardId: string): AnyAgentSpec {
	const tools = PLAN_TOOLS[goalCardId];
	const books = PLAN_LIBRARIAN_BOOKS[goalCardId];
	const connector = PLAN_CONNECTOR_CONFIG[goalCardId];
	if (!books && !connector) return buildSpec({ goalCardId, ...(tools ? { tools } : {}) });

	// v2-only bricks — `buildSpec`'s own tools override only ever reaches
	// the V1 Tools brick's `enabled` list, which has no door for a brick
	// registered against a different slot entirely.
	const migrated = migrateAgentSpec(
		buildSpec({ goalCardId, ...(books ? { memory: null } : {}), ...(tools ? { tools } : {}) })
	);
	if ('kind' in migrated) throw new Error(migrated.message);
	if (books) {
		migrated.bricks.push({
			slot: 'memory',
			kind: 'starter/librarian',
			config: { windowSize: 10, notebook: false, books },
			configVersion: 1
		});
	}
	if (connector) {
		migrated.bricks.push({
			slot: 'equipment',
			kind: 'starter/connector',
			config: connector,
			configVersion: 1
		});
	}
	return migrated;
}

async function solve(goalCardId: string, maxTicks?: number) {
	const plan = planFor(goalCardId);
	return runToCompletion({
		script: obedient(plan),
		spec: specFor(goalCardId),
		stepLimit: plan.length + 5,
		...(maxTicks !== undefined ? { maxTicks } : {})
	});
}

describe('every goal card has a scripted solution', () => {
	it('ships a plan for every card in the pack', () => {
		expect(Object.keys(SCRIPTED_OPTIMAL).sort()).toEqual(
			starterGoalCards.map((card) => card.id).sort()
		);
	});

	const winnable = starterGoalCards.filter((card) => !card.expert);

	it.each(winnable)('$id is won inside the default budget', async (card) => {
		const run = await solve(card.id);
		expect(run.outcome).toBe('SUCCESS');
		expect(run.byType('tick.started').length).toBeLessThanOrEqual(DEFAULT_TICK_BUDGET);
	});

	it.each(winnable.filter((card) => card.par !== undefined))(
		'$id takes exactly the par it advertises',
		async (card) => {
			const run = await solve(card.id);
			expect(run.byType('tick.started')).toHaveLength(card.par as number);
		}
	);

	it('does not waste a single turn: every action in an optimal plan works', async () => {
		for (const card of winnable) {
			const run = await solve(card.id);
			const failed = run
				.byType('action.performed')
				.filter((event) => !(event.payload as { result: { ok: boolean } }).result.ok);
			expect(failed, `${card.id} wasted a turn`).toHaveLength(0);
		}
	});
});

describe('the expert card', () => {
	const expert = starterGoalCards.find((card) => card.expert);

	it('cannot be won on the default budget — which is why it says so', async () => {
		const run = await solve(expert?.id ?? '');
		expect(run.outcome).toBe('OUT_OF_STEPS');
	});

	it('is won once the builder turns the step dial up', async () => {
		const run = await solve(expert?.id ?? '', 60);
		expect(run.outcome).toBe('SUCCESS');
		expect(run.byType('tick.started')).toHaveLength(expert?.par as number);
	});
});

/**
 * The C1 regression named in `13-…` §4.4: a bot must be able to go back to
 * something it saw once. Sight reaches one square, so the memory summary is
 * the only record — if it holds names without bearings, "I saw a snack
 * somewhere" is unactionable and the run degenerates into wandering.
 */
describe('what the memory window is worth', () => {
	it('records where a thing was, not merely that it existed', async () => {
		const run = await solve('starter/snack');
		const summaries = run
			.byType('sense')
			.map((event) => (event.payload as { observation: { summary?: string } }).observation.summary)
			.filter((summary): summary is string => summary !== undefined);

		const sighting = summaries.find((summary) => summary.includes('snack'));
		expect(sighting).toBeDefined();
		expect(sighting).toMatch(/at column \d+, row \d+/);
		expect(sighting).toMatch(/to the (north|south|east|west)/);
	});
});
