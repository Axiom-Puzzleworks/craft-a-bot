import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { WorldCreateOptions, WorldDefinition, WorldInstance } from '../types/world.js';
import { createMockProvider, createTestClock, v1BrickKinds } from '../testing/index.js';
import { createSession } from './agent-session.js';
import { createSessionGroup } from './session-group.js';

/**
 * `create(layoutId, { random })` (WP53 stage B, `43-…` §4.4): the session and
 * the group hand a world their own seeded stream, so a generated layout
 * varies and replays by seed. A world that ignores the argument is unchanged.
 */
function recordingWorld(seen: WorldCreateOptions[]): WorldDefinition {
	const instance = (): WorldInstance => ({
		snapshot: () => ({
			width: 1,
			height: 1,
			bot: { position: { x: 0, y: 0 } },
			furniture: [],
			containers: [],
			characters: [],
			items: []
		}),
		observe: () => ({ channels: [], text: 'nothing' }),
		perform: () => ({ ok: true, narration: 'done', stateDiff: [] }),
		test: () => true,
		reset: () => undefined,
		forAgent: () => instance()
	});
	return {
		id: 'rec/world',
		name: 'Recording world',
		layouts: [{ id: 'a', name: 'A', initialState: {} }],
		actions: [],
		senses: [],
		predicates: { done: 'Done.' },
		create: (_layoutId, options) => {
			seen.push(options ?? {});
			return instance();
		}
	};
}

function registryWith(world: WorldDefinition) {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'rec',
		name: 'Rec',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [world],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'rec/brain',
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
				id: 'rec/goal',
				title: 'Go',
				goalText: 'Go.',
				worldId: 'rec/world',
				layoutId: 'a',
				successCondition: 'done',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

const spec = (id: string): AgentSpec => ({
	id,
	name: 'Rec bot',
	bricks: { llm: { cartridgeId: 'rec/brain', temperature: 0, maxTokens: 64, personality: '' } },
	goalCardId: 'rec/goal',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
});

describe('WorldDefinition.create receives the session’s random', () => {
	it('from a solo session', () => {
		const seen: WorldCreateOptions[] = [];
		const clock = createTestClock();
		createSession({
			spec: spec('11111111-1111-4111-8111-111111111111'),
			registry: registryWith(recordingWorld(seen)),
			provider: createMockProvider({ script: [] }),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		expect(seen).toHaveLength(1);
		expect(seen[0]?.random).toBe(clock.random);
	});

	it('from a session group, once for the shared root', () => {
		const seen: WorldCreateOptions[] = [];
		const clock = createTestClock();
		createSessionGroup({
			members: [
				{
					spec: spec('11111111-1111-4111-8111-111111111111'),
					provider: createMockProvider({ script: [] })
				},
				{
					spec: spec('22222222-2222-4222-8222-222222222222'),
					provider: createMockProvider({ script: [] })
				}
			],
			registry: registryWith(recordingWorld(seen)),
			goalCardId: 'rec/goal',
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		expect(seen).toHaveLength(1);
		expect(seen[0]?.random).toBe(clock.random);
	});
});
