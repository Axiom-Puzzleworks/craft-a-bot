import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import type { WorldDefinition, WorldInstance } from '../types/world.js';
import { createMockProvider, createTestClock, v1BrickKinds } from '../testing/index.js';
import { projectThrough } from '../projection/run-projection.js';
import { createSession } from './agent-session.js';

/**
 * `WorldInstance.truth?()` and `run.finished.truth` (WP54 stage A,
 * `45-TRUTH-SYNTHETIC.md` §4.1): truth crosses onto the trace exactly once,
 * on `run.finished`, on no other event, and not at all when the world has
 * none. A stub world so the test is about the session, not a desk.
 */
function stubWorld(truth?: () => unknown): WorldDefinition {
	const instance = (): WorldInstance => ({
		snapshot: () => ({ visible: 'only this' }),
		observe: () => ({ channels: [], text: 'nothing to see' }),
		perform: () => ({ ok: true, narration: 'done', stateDiff: [] }),
		test: () => true,
		reset: () => undefined,
		...(truth ? { truth } : {})
	});
	return {
		id: 'stub/world',
		name: 'Stub world',
		layouts: [{ id: 'a', name: 'A', initialState: {} }],
		actions: [],
		senses: [],
		predicates: { done: 'Done.' },
		create: () => instance()
	};
}

function registryWith(world: WorldDefinition) {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'stub',
		name: 'Stub',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [world],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'stub/brain',
				providerId: 'mock',
				model: 'm',
				displayName: 'M',
				blurb: '.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'stub/goal',
				title: 'Go',
				goalText: 'Go.',
				worldId: 'stub/world',
				layoutId: 'a',
				successCondition: 'done',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

const spec: AgentSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Stub bot',
	bricks: { llm: { cartridgeId: 'stub/brain', temperature: 0, maxTokens: 64, personality: '' } },
	goalCardId: 'stub/goal',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
};

async function runOver(world: WorldDefinition): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const session = createSession({
		spec,
		registry: registryWith(world),
		provider: createMockProvider({ script: [] }),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});
	session.events.onAny((event) => events.push(event));
	// The predicate is always true, so the first tick finishes the run.
	await session.step();
	return events;
}

const SECRET = 'the-visitor-was-never-expected';

describe('truth on run.finished', () => {
	it('is written exactly once, on run.finished, and on no other event', async () => {
		const events = await runOver(stubWorld(() => ({ secret: SECRET })));
		const finished = events.filter((event) => event.type === 'run.finished');
		expect(finished).toHaveLength(1);
		expect(finished[0]?.payload).toMatchObject({ truth: { secret: SECRET } });
		const others = events.filter((event) => event.type !== 'run.finished');
		expect(others.length).toBeGreaterThan(0);
		expect(JSON.stringify(others)).not.toContain(SECRET);
	});

	it('is absent — not null — when the world has no truth', async () => {
		const events = await runOver(stubWorld());
		const finished = events.find((event) => event.type === 'run.finished');
		expect(finished).toBeDefined();
		expect('truth' in (finished?.payload as object)).toBe(false);
	});

	it('reaches the projection only once the run has finished', async () => {
		const events = await runOver(stubWorld(() => ({ secret: SECRET })));
		const before = projectThrough(events.filter((event) => event.type !== 'run.finished'));
		expect(before.truth).toBeUndefined();
		expect(projectThrough(events).truth).toEqual({ secret: SECRET });
	});
});
