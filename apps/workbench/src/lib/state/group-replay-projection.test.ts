import { obedient } from '@craftabot/core/testing';
import type { EngineEvent } from '@craftabot/core';
import {
	TIDY_TOGETHER_SEAT_A,
	TIDY_TOGETHER_SEAT_B,
	buildSpec,
	runGroupToCompletion
} from '@craftabot/pack-starter/testing';
import { describe, expect, it } from 'vitest';
import { projectGroupThrough } from './group-replay-projection.js';

/**
 * **WP31 stage D** (`24-ROBOT-FRIENDS-DESIGN.md` §4.5, §10): the replay fold,
 * proven against a real `SessionGroup`'s own merged trace — the same rigor
 * `run-projection-group.test.ts` (stage E) held the per-member replay to,
 * extended here to the merged stream a stored `GroupRunRecord` actually
 * hands the replay screen.
 */

const ROBO_ID = '11111111-1111-4111-8111-111111111111';
const BOLT_ID = '22222222-2222-4222-8222-222222222222';

function twoSeats() {
	return [
		{
			script: obedient(TIDY_TOGETHER_SEAT_A),
			spec: buildSpec({ id: ROBO_ID, name: 'Robo', goalCardId: 'starter/tidy-together' })
		},
		{
			script: obedient(TIDY_TOGETHER_SEAT_B),
			spec: buildSpec({ id: BOLT_ID, name: 'Bolt', goalCardId: 'starter/tidy-together' })
		}
	];
}

let seq = 0;
function at<T extends EngineEvent['type']>(
	agentId: string,
	tick: number,
	type: T,
	payload: unknown
): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: agentId,
		agentId,
		tick,
		timestamp: '2026-08-20T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const worldChanged = (agentId: string, tick: number) =>
	at(agentId, tick, 'world.changed', { state: { width: 8, height: 6, agents: [] } });

describe('projectGroupThrough', () => {
	it('has nothing to show before anyone has acted', () => {
		const projection = projectGroupThrough([]);
		expect(projection.foregroundedAgentId).toBeUndefined();
		expect(projection.member.world).toBeUndefined();
	});

	/**
	 * The exact bug a naive `projectThrough(mergedEvents)` would have: `tripped`
	 * never resets, so a member who never tripped anything would still read as
	 * tripped once *any* member ever has. Robo trips a guardrail in round 1;
	 * Bolt, foregrounded by round 2, must not inherit it.
	 */
	it('never lets one member’s sticky state (tripped) bleed into another’s replay', () => {
		const events: EngineEvent[] = [
			at(ROBO_ID, 1, 'guardrail.tripped', {
				guardrailId: 'test/rule',
				hook: 'pre-act',
				reason: 'test trip',
				disposition: 'block-action'
			}),
			worldChanged(ROBO_ID, 1),
			worldChanged(BOLT_ID, 2)
		];

		const round1 = projectGroupThrough(events, 1);
		expect(round1.foregroundedAgentId).toBe(ROBO_ID);
		expect(round1.member.tripped).toBe(true);

		const round2 = projectGroupThrough(events, 2);
		expect(round2.foregroundedAgentId).toBe(BOLT_ID);
		expect(round2.member.tripped).toBe(false);
	});

	it('foregrounds whoever acted last, matching the live route’s own rule', async () => {
		const run = await runGroupToCompletion({ members: twoSeats() });

		// Round 1: Robo goes first, Bolt second — Bolt's own action is the
		// round's last world.changed, exactly as `session-group.svelte.ts`'s
		// own live `absorb` foregrounds it (proven in `session-group.svelte.test.ts`).
		const afterRound1 = projectGroupThrough(run.events, 1);
		expect(afterRound1.foregroundedAgentId).toBe(BOLT_ID);
		expect(afterRound1.member.tick).toBe(1);

		const atEnd = projectGroupThrough(run.events);
		const lastWorldChanged = [...run.events]
			.reverse()
			.find((event) => event.type === 'world.changed');
		expect(atEnd.foregroundedAgentId).toBe(lastWorldChanged?.agentId);
	});

	it('the world is always the whole shared room, whichever member is foregrounded', async () => {
		const run = await runGroupToCompletion({ members: twoSeats() });
		const projection = projectGroupThrough(run.events);
		const world = projection.member.world as { agents?: { id: string }[] } | undefined;

		expect(world).toBeDefined();
		expect(world?.agents?.map((agent) => agent.id).sort()).toEqual([BOLT_ID, ROBO_ID].sort());
	});
});
