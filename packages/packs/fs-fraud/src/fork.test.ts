import {
	brainTurnsThrough,
	createSession,
	forkSession,
	type AnyAgentSpec,
	type EngineEvent
} from '@craftabot/core';
import {
	createMockProvider,
	createTestClock,
	obedient,
	type MockScript
} from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { FREEZE_NEEDS_A_SECOND_LOOK } from './cards/policy.js';
import { fraudCardId } from './decks/goal-cards.js';
import { buildRegistry, buildSpec } from './testing/harness.js';
import { adversaryPlanFor } from './testing/plans.js';

/**
 * **The counterfactual** (WP66, `54-FORK-EXPLAIN.md` §11 item 2): the
 * adversary works the mixed queue — releases alert 1, then freezes alert 2
 * at tick 2. Forked after tick 1 with *Freeze needs a second look* added
 * to the build, the fork pauses for a person exactly where the origin
 * froze; forked with nothing changed, it freezes as the origin did.
 */
async function drive(
	spec: AnyAgentSpec,
	script: MockScript,
	fork?: { events: EngineEvent[]; tick: number; spec?: AnyAgentSpec },
	approve = true
) {
	const clock = createTestClock();
	const deps = {
		spec,
		registry: buildRegistry(),
		// A fork resumes the scripted brain where the origin left it (`54-…` §2 item 5).
		provider: createMockProvider({
			script,
			...(fork ? { startAt: brainTurnsThrough(fork.events, fork.tick) } : {})
		}),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	};
	const session = fork
		? forkSession(deps, {
				from: { events: fork.events, tick: fork.tick },
				...(fork.spec ? { overrides: { spec: fork.spec } } : {})
			})
		: createSession(deps);
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(approve));
	session.start('step');
	for (let step = 0; step < 12; step++) if ((await session.step()).outcome) break;
	return events;
}

const performedAt = (events: readonly EngineEvent[], tick: number) =>
	events
		.filter((event) => event.type === 'action.performed' && event.tick === tick)
		.map((event) => (event.type === 'action.performed' ? event.payload.name.split('/').pop() : ''));

describe('forking the Fraud Desk freeze', () => {
	const card = fraudCardId('queue-mixed');
	const plan = adversaryPlanFor(card);

	it('the origin freezes alert 2 at tick 2 with nothing to stop it', async () => {
		const origin = await drive(buildSpec({ goalCardId: card }), obedient(plan));
		expect(performedAt(origin, 2)).toEqual(['freeze-account']);
		expect(origin.some((event) => event.type === 'approval.requested')).toBe(false);
	});

	it('forked after tick 1 with Freeze needs a second look added, the fork pauses where the origin froze', async () => {
		const spec = buildSpec({ goalCardId: card });
		const origin = await drive(spec, obedient(plan));
		const guarded = buildSpec({
			goalCardId: card,
			safety: {
				maxTicks: 20,
				blockedActions: [],
				approvalMode: false,
				policyCards: [FREEZE_NEEDS_A_SECOND_LOOK.id]
			}
		});
		const script = obedient(plan);
		const refused = await drive(spec, script, { events: origin, tick: 1, spec: guarded }, false);
		const asked = refused.find((event) => event.type === 'approval.requested');
		expect(asked?.tick).toBe(2);
		expect(
			asked?.type === 'approval.requested' && asked.payload.proposed.name.endsWith('freeze-account')
		).toBe(true);
		// A person said no: the account stays open on the fork.
		expect(performedAt(refused, 2)).toEqual([]);
		const started = refused.find((event) => event.type === 'run.started');
		expect(started?.type === 'run.started' && started.payload.forkedFrom).toMatchObject({
			runId: origin[0]?.runId,
			tick: 1
		});
	});

	it('forked after tick 1 with nothing changed, the fork freezes as the origin did', async () => {
		const spec = buildSpec({ goalCardId: card });
		const origin = await drive(spec, obedient(plan));
		const same = await drive(spec, obedient(plan), {
			events: origin,
			tick: 1
		});
		expect(performedAt(same, 2)).toEqual(['freeze-account']);
		// Neither run reaches an outcome (the adversary never clears the queue): compare the ticks the origin ran.
		const last = Math.max(...origin.map((event) => event.tick));
		const strip = (events: readonly EngineEvent[]) =>
			events
				.filter((event) => event.tick > 1 && event.tick <= last)
				.map((event) => ({ type: event.type, tick: event.tick, payload: event.payload }));
		expect(strip(same)).toEqual(strip(origin));
	});
});
