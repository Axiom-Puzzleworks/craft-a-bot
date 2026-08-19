import type { EngineEvent } from '@craftabot/core';
import { createMockProvider, obedient } from '@craftabot/core/testing';
import {
	TIDY_TOGETHER_SEAT_A,
	TIDY_TOGETHER_SEAT_B,
	buildSpec,
	type Plan
} from '@craftabot/pack-starter/testing';
import { describe, expect, it } from 'vitest';
import { createGroupSessionView } from './session-group.svelte.js';

/**
 * **WP31 stage A** (`24-ROBOT-FRIENDS-DESIGN.md` §10): `createGroupSessionView`
 * proven against a real `SessionGroup` — the real Playroom, the real starter
 * pack, `starter/tidy-together` — the rigor `session.svelte.ts` itself never
 * got (it has no dedicated test file; only the Kit's own e2e suite proves it).
 *
 * The demo cartridge (`demo/demo-brain`, registered by the real `demoPack` in
 * `createRegistry()`) supplies a valid, already-registered `cartridgeId` for
 * the specs below — its own scripted plans are never used. The provider each
 * member actually runs on is handed in directly, exactly as
 * `GroupSessionViewDeps.members[n].provider` is designed to take one, so the
 * cartridge id only needs to resolve for the engine's own config lookups.
 */

const ROBO_ID = '11111111-1111-4111-8111-111111111111';
const BOLT_ID = '22222222-2222-4222-8222-222222222222';
const GOAL_CARD_ID = 'starter/tidy-together';

function memberSpec(id: string, name: string) {
	return buildSpec({ id, name, goalCardId: GOAL_CARD_ID });
}

function member(id: string, name: string, plan: Plan) {
	return { spec: memberSpec(id, name), provider: createMockProvider({ script: obedient(plan) }) };
}

function twoMembers() {
	return [
		member(ROBO_ID, 'Robo', TIDY_TOGETHER_SEAT_A),
		member(BOLT_ID, 'Bolt', TIDY_TOGETHER_SEAT_B)
	];
}

describe('createGroupSessionView', () => {
	it('starts with both members present, before either has taken a turn', () => {
		const view = createGroupSessionView({ members: twoMembers(), goalCardId: GOAL_CARD_ID });

		expect(view.members.map((member) => member.agentId)).toEqual([ROBO_ID, BOLT_ID]);
		expect(view.members.map((member) => member.name)).toEqual(['Robo', 'Bolt']);
		expect(view.members.every((member) => member.runId.length > 0)).toBe(true);
		expect(view.members.every((member) => !member.started)).toBe(true);
		expect(view.world).toBeUndefined();
		expect(view.round).toBe(0);
		expect(view.status).toBe('idle');
	});

	it('drives the group round by round, updating the shared world and both members', async () => {
		const events: EngineEvent[] = [];
		const view = createGroupSessionView({
			members: twoMembers(),
			goalCardId: GOAL_CARD_ID,
			onEvent: (event) => events.push(event)
		});

		const first = await view.stepRound();
		expect(first.round).toBe(1);
		expect(view.round).toBe(1);
		// A round completes and the group sits paused until the next stepRound()
		// call — nothing auto-drives it in step mode, the same shape a solo
		// session's own status takes between manual step() calls.
		expect(view.status).toBe('paused');

		// Both members took a turn — the world reflects it, and every event this
		// round produced reached the host callback (hard rule 3: nothing here
		// that events did not carry).
		expect(view.world).toBeDefined();
		expect(view.world?.agents?.map((agent) => agent.id).sort()).toEqual([BOLT_ID, ROBO_ID].sort());
		expect(view.members.every((member) => member.started)).toBe(true);
		expect(view.members.every((member) => member.tick === 1)).toBe(true);
		expect(events.some((event) => event.type === 'group.started')).toBe(true);
		expect(events.filter((event) => event.type === 'tick.completed')).toHaveLength(2);

		// Drive it to completion — the same 12-round, SUCCESS proof stage E's
		// own DoD test runs, watched through the view this time instead of the
		// bare harness.
		let result = first;
		for (let round = 0; round < 20 && result.outcome === undefined; round++) {
			result = await view.stepRound();
		}

		expect(result.outcome).toBe('SUCCESS');
		expect(view.outcome).toBe('SUCCESS');
		expect(view.status).toBe('finished');
		expect(view.round).toBe(12);
		expect(view.members.every((member) => member.outcome === 'SUCCESS')).toBe(true);
	});

	it('names which member a pending approval belongs to, and only that member’s resolveApproval clears it', async () => {
		const view = createGroupSessionView({
			members: [
				{
					...twoMembers()[0]!,
					guardrails: [
						{
							id: 'test/ask-first',
							name: 'Ask first',
							description: 'Always checks with a person before acting.',
							hooks: ['pre-act'],
							check: () => ({ pause: true as const, reason: 'checking with a person' })
						}
					]
				},
				twoMembers()[1]!
			],
			goalCardId: GOAL_CARD_ID
		});

		const pending = view.stepRound();
		// Robo's own tick (sense → compose → think → decide → pre-act) is several
		// real awaits deep before it reaches the pause — poll microtasks rather
		// than guess a fixed count, the same reasoning `session-group.test.ts`
		// (core) uses for the identical shape of wait.
		for (let i = 0; i < 200 && view.pendingApproval === undefined; i++) {
			await Promise.resolve();
		}

		expect(view.pendingApproval?.agentId).toBe(ROBO_ID);
		expect(view.status).toBe('awaiting-approval');

		view.resolveApproval(ROBO_ID, true);
		await pending;

		expect(view.pendingApproval).toBeUndefined();
	});

	it('deliverInput reaches the shared world, and every event flows to onEvent', async () => {
		const events: EngineEvent[] = [];
		const view = createGroupSessionView({
			members: twoMembers(),
			goalCardId: GOAL_CARD_ID,
			onEvent: (event) => events.push(event)
		});

		view.deliverInput('hello from outside');
		await view.stepRound();

		expect(events.some((event) => event.type === 'input.delivered')).toBe(true);
	});
});
