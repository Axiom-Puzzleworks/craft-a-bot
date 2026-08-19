import { obedient } from '@craftabot/core/testing';
import type { GridWorldState } from '@craftabot/core';
import {
	TIDY_TOGETHER_SEAT_A,
	TIDY_TOGETHER_SEAT_B,
	buildSpec,
	runGroupToCompletion
} from '@craftabot/pack-starter/testing';
import { describe, expect, it } from 'vitest';
import { projectThrough } from './run-projection.js';

/**
 * **WP29 stage E** (`23-MULTI-AGENT-DESIGN.md` §10): the third leg of the
 * roadmap DoD — "group trace replays" — proved against the one fold the Kit
 * and the Workshop both actually use.
 *
 * `projectThrough` only exists here, in the workbench (`run-projection.ts`
 * §header); `pack-starter`'s own stage-E suite
 * (`session/group-solvability.test.ts`) proves the `SessionGroup` behaviour
 * itself — completion, no wasted turns, byte-identical repeat runs. This file
 * proves the one thing that needs the workbench's own fold to prove at all:
 * that a member's trace, replayed exactly as the Run Lab would replay it,
 * lands on a world consistent with its seatmate's.
 *
 * **Divergence from `23-…` §10's prose**, noted here and in `23-…` §8: the
 * design doc describes this proof as living entirely "in `pack-starter`'s
 * session harness". `projectThrough` cannot — it is a workbench module by
 * design (hard rule 1: `core` and the packs never import Svelte or touch the
 * DOM, and this fold underpins Svelte state). Splitting the DoD's three
 * proofs across the two packages that actually own each piece is smaller and
 * more honest than moving `projectThrough` somewhere it does not belong.
 */

function twoSeats() {
	return [
		{
			script: obedient(TIDY_TOGETHER_SEAT_A),
			spec: buildSpec({
				id: '11111111-1111-4111-8111-111111111111',
				name: 'Robo',
				goalCardId: 'starter/tidy-together'
			})
		},
		{
			script: obedient(TIDY_TOGETHER_SEAT_B),
			spec: buildSpec({
				id: '22222222-2222-4222-8222-222222222222',
				name: 'Bolt',
				goalCardId: 'starter/tidy-together'
			})
		}
	];
}

describe('a group episode’s member traces, replayed through projectThrough', () => {
	it('each member’s own trace replays to completion on its own', async () => {
		const run = await runGroupToCompletion({ members: twoSeats() });
		for (const trace of run.memberEvents) {
			const projection = projectThrough(trace);
			expect(projection.outcome).toBe('SUCCESS');
			expect(projection.world).toBeDefined();
		}
	});

	/**
	 * `world.changed` fires only on a *successful action* (`agent-session.ts`),
	 * so a member's own trace is only ever as fresh as its own last turn — Robo
	 * stops acting at round 7, five rounds before the group actually finishes.
	 * Both replays are honest snapshots of what each robot *itself* did and saw,
	 * not an omniscient merge — which is `23-…` §1's "a shared goal does not
	 * mean shared understanding" made mechanical, not a staleness bug.
	 */
	it('each replay shows exactly what that robot itself knows — not a shared, omniscient view', async () => {
		const run = await runGroupToCompletion({ members: twoSeats() });
		const [robo, bolt] = run.memberEvents;
		const roboWorld = projectThrough(robo ?? []).world as GridWorldState;
		const boltWorld = projectThrough(bolt ?? []).world as GridWorldState;

		const findLocation = (world: GridWorldState, itemId: string) =>
			world.items.find((item) => item.id === itemId)?.location;

		// Bolt's own last action *is* the one that completes the goal — its own
		// replay shows the fully tidied room.
		expect(findLocation(boltWorld, 'block-a')).toEqual({
			kind: 'in-container',
			containerId: 'toy-chest'
		});
		expect(findLocation(boltWorld, 'block-b')).toEqual({
			kind: 'in-container',
			containerId: 'toy-chest'
		});

		// Robo's own replay knows it delivered block-a itself…
		expect(findLocation(roboWorld, 'block-a')).toEqual({
			kind: 'in-container',
			containerId: 'toy-chest'
		});
		// …but never learns block-b made it into the chest too: Robo's trace ends
		// at round 7, while Bolt is still five rounds away from putting it down.
		expect(findLocation(roboWorld, 'block-b')).toEqual({
			kind: 'carried',
			agentId: '22222222-2222-4222-8222-222222222222'
		});

		// Both replays still agree on where Robo itself is — that much both
		// robots' own actions kept in sync (`23-…` §4.8's seat-swap trick).
		const roboSeat = boltWorld.agents?.find((agent) => agent.name === 'Robo');
		expect(roboWorld.bot.position).toEqual(roboSeat?.position);
	});

	it('is deterministic: a second run’s replays match the first’s, member for member', async () => {
		const first = await runGroupToCompletion({ members: twoSeats() });
		const second = await runGroupToCompletion({ members: twoSeats() });

		expect(first.memberEvents).toHaveLength(second.memberEvents.length);
		for (let i = 0; i < first.memberEvents.length; i++) {
			const a = projectThrough(first.memberEvents[i] ?? []);
			const b = projectThrough(second.memberEvents[i] ?? []);
			expect(a).toEqual(b);
		}
	});
});
