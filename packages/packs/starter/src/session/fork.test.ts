import {
	brainTurnsThrough,
	createSession,
	forkSession,
	migrateAgentSpec,
	type AgentSpecV2,
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
import { buildRegistry, buildSpec } from './harness.js';
import { adversaryPlanFor, SCRIPTED_OPTIMAL } from './plans.js';

/**
 * **The fork over the starter goldens** (WP66, `54-FORK-EXPLAIN.md` §11 item
 * 1): say-hello and the confused-deputy run, each forked at every completed
 * tick but the last, each fork reproducing the origin after the fork tick in
 * `{ type, tick, payload }`. The Playroom is put back through its own
 * `restore`; the notebook comes back from the notebook tool's own calls.
 */
const comparable = (events: readonly EngineEvent[], after: number) =>
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

async function drive(
	spec: AnyAgentSpec,
	script: MockScript,
	fork?: { events: EngineEvent[]; tick: number },
	maxTicks?: number
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
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(maxTicks !== undefined ? { budgets: { maxTicks } } : {})
		}
	};
	const session = fork ? forkSession(deps, { from: fork }) : createSession(deps);
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => session.resolveApproval(true));
	session.start('step');
	for (let step = 0; step < 40; step++) if ((await session.step()).outcome) break;
	return events;
}

const completedTicks = (events: readonly EngineEvent[]) =>
	events.filter((event) => event.type === 'tick.completed').map((event) => event.tick);

function overScoped(): AgentSpecV2 {
	const migrated = migrateAgentSpec(buildSpec({ goalCardId: 'starter/false-alarm', memory: null }));
	if ('kind' in migrated) throw new Error(migrated.message);
	migrated.bricks.push({
		slot: 'equipment',
		kind: 'starter/connector',
		config: { serviceId: 'weather', scopes: ['forecast'] },
		configVersion: 1
	});
	return migrated;
}

describe('forkSession over the starter goldens', () => {
	it('say-hello: a fork at every completed tick reproduces the origin after it', async () => {
		const plan = SCRIPTED_OPTIMAL['starter/say-hello'] ?? [];
		const spec = buildSpec({ goalCardId: 'starter/say-hello' });
		const origin = await drive(spec, obedient(plan));
		const ticks = completedTicks(origin);
		expect(ticks.length).toBeGreaterThan(1);
		for (const tick of ticks.slice(0, -1)) {
			const fork = await drive(spec, obedient(plan), {
				events: origin,
				tick
			});
			expect(comparable(fork, tick), `tick ${tick}`).toEqual(comparable(origin, tick));
		}
	});

	it('confused-deputy: the fork carries the tool call and the memoryless build through', async () => {
		const spec = overScoped();
		const plan = adversaryPlanFor('starter/false-alarm');
		const origin = await drive(spec, obedient(plan), undefined, 3);
		const ticks = completedTicks(origin);
		for (const tick of ticks.slice(0, -1)) {
			const fork = await drive(spec, obedient(plan), { events: origin, tick }, 3);
			expect(comparable(fork, tick), `tick ${tick}`).toEqual(comparable(origin, tick));
		}
	});

	it('a notebook written before the fork is on the fork’s prompt, and run.started says so', async () => {
		const spec = buildSpec({ goalCardId: 'starter/say-hello', tools: ['starter/notebook_write'] });
		const plan = [
			{ say: 'Noting.', call: 'notebook_write', args: { note: 'Teddy is east.' } },
			...(SCRIPTED_OPTIMAL['starter/say-hello'] ?? [])
		];
		const origin = await drive(spec, obedient(plan));
		expect(origin.some((event) => event.type === 'tool.executed')).toBe(true);
		const fork = await drive(spec, obedient(plan), {
			events: origin,
			tick: 1
		});
		const started = fork.find((event) => event.type === 'run.started');
		expect(started?.type === 'run.started' && started.payload.forkedFrom?.notebook).toBe(
			'restored'
		);
		const prompt = fork.find((event) => event.type === 'prompt.composed');
		expect(
			prompt?.type === 'prompt.composed' &&
				prompt.payload.messages.some((message) => message.content.includes('Teddy is east.'))
		).toBe(true);
		expect(comparable(fork, 1)).toEqual(comparable(origin, 1));
	});
});
