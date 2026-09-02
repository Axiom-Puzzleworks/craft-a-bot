import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '../schemas/events.js';
import { projectGroupThrough } from './group-replay-projection.js';

/**
 * The fold's own rules, over hand-built events (WP36 stage B). The proof that
 * it agrees with a *real* two-robot episode drives `@craftabot/pack-starter`
 * and therefore stays in the workbench (`run-projection-group.test.ts`,
 * `group-replay-projection.test.ts` there) — core cannot depend on a pack.
 * What is held here is what the module's own doc comment promises: the
 * foregrounded seat comes from the last `world.changed` at or before the
 * scrubbed tick, and that member's projection is folded from its own events
 * alone, so one robot's sticky state never bleeds into the other's face.
 */

const ROBO = '11111111-1111-4111-8111-111111111111';
const BOLT = '22222222-2222-4222-8222-222222222222';
const GROUP = '33333333-3333-4333-8333-333333333333';

let seq = 0;
function event(
	agentId: string,
	tick: number,
	type: EngineEvent['type'],
	payload: unknown
): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: agentId,
		agentId,
		parentRunId: GROUP,
		tick,
		timestamp: '2026-09-02T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

const world = (agentId: string, tick: number, marker: string) =>
	event(agentId, tick, 'world.changed', { state: { width: 1, height: 1, marker } });

const tripped = (agentId: string, tick: number) =>
	event(agentId, tick, 'guardrail.tripped', {
		guardrailId: 'starter/step-budget',
		hook: 'pre-act',
		reason: 'no',
		disposition: 'block-action'
	});

/** Round-robin: each round's events arrive as two whole blocks, Robo then Bolt. */
const merged: EngineEvent[] = [
	world(ROBO, 1, 'robo-1'),
	world(BOLT, 1, 'bolt-1'),
	tripped(ROBO, 2),
	world(ROBO, 2, 'robo-2'),
	world(BOLT, 2, 'bolt-2')
];

describe('projectGroupThrough', () => {
	it('is empty before anyone has acted', () => {
		const replay = projectGroupThrough(merged, 0);
		expect(replay.foregroundedAgentId).toBeUndefined();
		expect(replay.member.world).toBeUndefined();
		expect(replay.member.events).toEqual([]);
	});

	it('foregrounds whichever member last changed the world at the scrubbed tick', () => {
		expect(projectGroupThrough(merged, 1).foregroundedAgentId).toBe(BOLT);
		expect(projectGroupThrough(merged).foregroundedAgentId).toBe(BOLT);
	});

	it('folds only the foregrounded member’s own events', () => {
		const replay = projectGroupThrough(merged, 2);
		expect(replay.foregroundedAgentId).toBe(BOLT);
		expect(replay.member.events.every((e) => e.agentId === BOLT)).toBe(true);
		expect(replay.member.world).toEqual({ width: 1, height: 1, marker: 'bolt-2' });
	});

	it('never lets one robot’s guardrail trip show on the other’s face', () => {
		// Robo tripped at tick 2; Bolt never did. Bolt is foregrounded at tick 2.
		expect(projectGroupThrough(merged, 2).member.tripped).toBe(false);

		// Foreground Robo instead by scrubbing to a stream where Robo acted last.
		const roboLast = merged.slice(0, 4);
		const replay = projectGroupThrough(roboLast, 2);
		expect(replay.foregroundedAgentId).toBe(ROBO);
		expect(replay.member.tripped).toBe(true);
	});

	it('respects the tick bound when choosing the foregrounded member', () => {
		const roboLast = merged.slice(0, 4);
		// Through tick 1 Bolt acted last; only past it does Robo's tick-2 change count.
		expect(projectGroupThrough(roboLast, 1).foregroundedAgentId).toBe(BOLT);
		expect(projectGroupThrough(roboLast, 2).foregroundedAgentId).toBe(ROBO);
	});
});
