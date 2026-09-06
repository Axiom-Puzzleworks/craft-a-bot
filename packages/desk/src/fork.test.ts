import {
	brainTurnsThrough,
	createSession,
	forkSession,
	tickMemoryFrom,
	worldStateThrough,
	type EngineEvent
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { buildRegistry, PLAN, runDeskMinimal, SPEC } from './golden-trace.test.js';

/**
 * **The fork over the desk golden** (WP66, `54-FORK-EXPLAIN.md` §11 item 1):
 * a fork at tick *n* with no overrides reproduces the origin after *n* in
 * `{ type, tick, payload }` — the envelope (ids, runId, timestamps) is the
 * fork's own, `run.started` says where it came from, and everything else is
 * the engine as it was. The desk is restored through its own door, the
 * counterpart's memory and the random's draws with it.
 */
export const comparable = (events: readonly EngineEvent[], after: number) =>
	events
		.filter((event) => event.tick > after || event.type === 'run.finished')
		.map((event) => ({
			type: event.type,
			tick: event.tick,
			payload:
				event.type === 'tool.executed'
					? { ...event.payload, durationMs: 0 }
					: event.type === 'run.started'
						? Object.fromEntries(
								Object.entries(event.payload).filter(([key]) => key !== 'forkedFrom')
							)
						: event.payload
		}));

async function forkAt(origin: readonly EngineEvent[], tick: number): Promise<EngineEvent[]> {
	// Its own clock, offset so the fork's ids are visibly its own: the payloads are what must match.
	const clock = createTestClock({ idOffset: 1000 });
	const session = forkSession(
		{
			spec: SPEC,
			registry: buildRegistry(),
			provider: createMockProvider({
				script: obedient(PLAN),
				startAt: brainTurnsThrough(origin, tick)
			}),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		},
		{ from: { events: origin, tick } }
	);
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.start('step');
	for (let step = 0; step < 10; step++) {
		const result = await session.step();
		if (result.outcome) break;
	}
	return events;
}

describe('forkSession over the desk golden', () => {
	it.each([1, 2])('a fork at tick %i reproduces the origin after it', async (tick) => {
		const origin = await runDeskMinimal();
		const fork = await forkAt(origin, tick);
		const started = fork.find((event) => event.type === 'run.started');
		expect(started?.type === 'run.started' && started.payload.forkedFrom).toEqual({
			runId: origin[0]?.runId,
			tick,
			notebook: 'empty'
		});
		// Nothing before the fork tick is re-emitted: the fork opens with its own run.started and the
		// restored world — the state the origin had after the fork tick — and its rows begin at tick + 1.
		const opening = fork.filter((event) => event.tick <= tick);
		expect(opening.map((event) => event.type)).toEqual(['run.started', 'world.changed']);
		expect(opening[1]?.type === 'world.changed' && opening[1].payload.state).toEqual(
			worldStateThrough(origin, tick)
		);
		expect(comparable(fork, tick)).toEqual(comparable(origin, tick));
		expect(new Set(fork.map((event) => event.runId)).size).toBe(1);
		expect(fork[0]?.runId).not.toBe(origin[0]?.runId);
	});

	it('refuses a tick the origin never completed, and a different goal card', async () => {
		const origin = await runDeskMinimal();
		const clock = createTestClock();
		const deps = {
			spec: SPEC,
			registry: buildRegistry(),
			provider: createMockProvider({ script: obedient(PLAN) }),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		};
		expect(() => forkSession(deps, { from: { events: origin, tick: 9 } })).toThrow(/tick 9/);
		expect(() =>
			forkSession(deps, {
				from: { events: origin, tick: 1 },
				overrides: { spec: { ...SPEC, goalCardId: 'test/other' } }
			})
		).toThrow(/goal card/);
	});

	it('the memory refold equals what the loop remembered', async () => {
		const origin = await runDeskMinimal();
		const clock = createTestClock();
		const session = createSession({
			spec: SPEC,
			registry: buildRegistry(),
			provider: createMockProvider({ script: obedient(PLAN) }),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		const prompts: string[] = [];
		session.events.on('prompt.composed', (event) =>
			prompts.push(event.payload.messages.map((m) => m.content).join('\n'))
		);
		session.start('step');
		for (let step = 0; step < 10; step++) if ((await session.step()).outcome) break;
		// The window the second prompt carried is the refold of tick 1.
		const refold = tickMemoryFrom(origin, 1);
		expect(refold).toHaveLength(1);
		expect(prompts[1]).toContain(refold[0]?.observation);
		expect(prompts[1]).toContain(refold[0]?.thought);
	});
});
