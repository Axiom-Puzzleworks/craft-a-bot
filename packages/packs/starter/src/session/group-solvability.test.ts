import { obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildSpec, runGroupToCompletion } from './harness.js';
import { TIDY_TOGETHER_SEAT_A, TIDY_TOGETHER_SEAT_B } from './plans.js';

const GOAL_CARD_ID = 'starter/tidy-together';
const ROBO = '11111111-1111-4111-8111-111111111111';
const BOLT = '22222222-2222-4222-8222-222222222222';

/**
 * **WP29 stage E** (`23-MULTI-AGENT-DESIGN.md` §10): the roadmap DoD, as
 * executable tests — "two scripted bots complete a co-op card
 * deterministically; group trace replays." Everything here runs a real
 * `SessionGroup` over the real Playroom and the real starter pack; nothing is
 * a fake or a fixture.
 *
 * "At par" for a group is not a stored number the way a solo card's `par` is
 * (`goal-cards.ts` keeps `starter/tidy-together`'s `par` as the solo figure,
 * per the divergence noted in `23-…` §8) — it means each seat's own plan
 * wastes no turn, which is asserted directly below rather than against a
 * schema field nothing defines.
 */

function twoSeats() {
	return [
		{
			script: obedient(TIDY_TOGETHER_SEAT_A),
			spec: buildSpec({ id: ROBO, name: 'Robo', goalCardId: GOAL_CARD_ID })
		},
		{
			script: obedient(TIDY_TOGETHER_SEAT_B),
			spec: buildSpec({ id: BOLT, name: 'Bolt', goalCardId: GOAL_CARD_ID })
		}
	];
}

describe('two scripted-optimal plans through a real SessionGroup', () => {
	it('completes starter/tidy-together deterministically', async () => {
		const run = await runGroupToCompletion({ members: twoSeats() });
		expect(run.outcome).toBe('SUCCESS');
	});

	it('wastes no turn on either seat', async () => {
		const run = await runGroupToCompletion({ members: twoSeats() });
		for (const trace of run.memberEvents) {
			const failed = trace
				.filter((event) => event.type === 'action.performed')
				.filter((event) => !(event.payload as { result: { ok: boolean } }).result.ok);
			expect(failed).toHaveLength(0);
		}
	});

	it('finishes in 12 rounds — Bolt in 11 real turns, Robo in 7 plus 5 idle rounds waiting on the shared goal', async () => {
		// Round-robin, not "whoever's done stops being asked": Robo's own plan is
		// only 7 actions, but its session keeps drawing a turn (mumbling once its
		// script runs out) every round until the *shared* predicate is true — the
		// scheduler cannot know Robo is "finished" early, because it isn't, until
		// Bolt's own put-down at round 11 makes it so. Robo notices on round 12,
		// the next turn it is offered. This is `23-…` §1's "co-operation is
		// harder than it looks" made mechanical, not a bug in the scheduler.
		const run = await runGroupToCompletion({ members: twoSeats() });
		expect(run.rounds).toBe(12);

		const [robo, bolt] = run.memberEvents;
		expect(robo?.filter((event) => event.type === 'tick.completed')).toHaveLength(12);
		expect(bolt?.filter((event) => event.type === 'tick.completed')).toHaveLength(11);

		// Well inside the 26 ticks the same room takes one bot alone (`plans.ts`'s
		// TIDY_TOGETHER) — the division of labour `23-…` §4.8 promises, in numbers.
		expect(run.rounds as number).toBeLessThan(26);
	});

	it('opens and closes every member’s own trace, in addition to the merged one', async () => {
		const run = await runGroupToCompletion({ members: twoSeats() });
		for (const trace of run.memberEvents) {
			expect(trace[0]?.type).toBe('run.started');
			expect(trace.at(-1)?.type).toBe('run.finished');
		}
		expect(run.events[0]?.type).toBe('group.started');
		expect(run.events.at(-1)?.type).toBe('group.finished');
	});

	it('reproduces the merged stream byte-identically on a second run', async () => {
		const first = await runGroupToCompletion({ members: twoSeats() });
		const second = await runGroupToCompletion({ members: twoSeats() });
		expect(JSON.stringify(second.events)).toEqual(JSON.stringify(first.events));
	});

	it('reproduces every member’s own trace byte-identically on a second run', async () => {
		const first = await runGroupToCompletion({ members: twoSeats() });
		const second = await runGroupToCompletion({ members: twoSeats() });
		expect(JSON.stringify(second.memberEvents)).toEqual(JSON.stringify(first.memberEvents));
	});
});
