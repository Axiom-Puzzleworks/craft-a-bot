import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import { toSpecV2, type AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import { goalCardDefinitionSchema, type GoalCardDefinition } from '../schemas/pack-manifest.js';
import type { WorldCreateOptions, WorldDefinition, WorldInstance } from '../types/world.js';
import { createMockProvider, createTestClock, v1BrickKinds } from '../testing/index.js';
import { createSession } from './agent-session.js';
import { createSessionGroup } from './session-group.js';
import { goalDialFor, worldConfigFor } from './world-config.js';

/**
 * **A card's dial** (WP131, `109-THE-TAIL-DAY7.md` §3): the player's setting
 * reaches the world at `create` as `config.knobs[knob]`, clamped to the dial
 * and snapped to its step, in the session, the group and a fork alike; the
 * value in force is on `run.started`; a card with no dial is untouched.
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
				teachesConcepts: [],
				dial: {
					knob: 'threshold',
					label: 'How sure before acting',
					min: 0,
					max: 1,
					step: 0.05,
					default: 0.5,
					format: 'percent'
				}
			}
		]
	});
	return registry;
}

const v1 = (id: string): AgentSpec => ({
	id,
	name: 'Rec bot',
	bricks: { llm: { cartridgeId: 'rec/brain', temperature: 0, maxTokens: 64, personality: '' } },
	goalCardId: 'rec/goal',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
});
const withDial = (id: string, goalDial?: number): AgentSpecV2 => ({
	...toSpecV2(v1(id)),
	...(goalDial !== undefined ? { goalDial } : {})
});

const CARD: GoalCardDefinition = {
	id: 'c',
	title: 'C',
	goalText: 'C.',
	worldId: 'w',
	layoutId: 'l',
	successCondition: 'done',
	hints: [],
	teachesConcepts: [],
	dial: { knob: 'threshold', label: 'Sure', min: 0, max: 1, step: 0.05, default: 0.5 }
};

describe('goalDialFor and worldConfigFor', () => {
	it('clamps to the dial, snaps to its step, and falls back to the default', () => {
		expect(goalDialFor(CARD, undefined)).toEqual({ knob: 'threshold', value: 0.5 });
		expect(goalDialFor(CARD, 0.63)).toEqual({ knob: 'threshold', value: 0.65 });
		expect(goalDialFor(CARD, 0.3 + 0.05)).toEqual({ knob: 'threshold', value: 0.35 });
		expect(goalDialFor(CARD, 7)).toEqual({ knob: 'threshold', value: 1 });
		expect(goalDialFor(CARD, -1)).toEqual({ knob: 'threshold', value: 0 });
		expect(goalDialFor(CARD, Number.NaN)).toEqual({ knob: 'threshold', value: 0.5 });
		expect(worldConfigFor(CARD, 0.7)).toEqual({ config: { knobs: { threshold: 0.7 } } });
		const plain: GoalCardDefinition = { ...CARD, dial: undefined };
		expect(goalDialFor(plain, 0.7)).toBeUndefined();
		expect(worldConfigFor(plain, 0.7)).toEqual({});
	});

	it('refuses a dial whose default is outside it', () => {
		expect(goalCardDefinitionSchema.safeParse(CARD).success).toBe(true);
		expect(
			goalCardDefinitionSchema.safeParse({ ...CARD, dial: { ...CARD.dial, default: 2 } }).success
		).toBe(false);
		expect(
			goalCardDefinitionSchema.safeParse({ ...CARD, dial: { ...CARD.dial, min: 1, max: 0 } })
				.success
		).toBe(false);
	});
});

describe('the dial reaches the world and the trace', () => {
	it('in a solo session: the setting in config, and on run.started', async () => {
		const seen: WorldCreateOptions[] = [];
		const clock = createTestClock();
		const session = createSession({
			spec: withDial('11111111-1111-4111-8111-111111111111', 0.7),
			registry: registryWith(recordingWorld(seen)),
			provider: createMockProvider({ script: [] }),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		expect(seen[0]?.config).toEqual({ knobs: { threshold: 0.7 } });
		const started: unknown[] = [];
		session.events.on('run.started', (event) => started.push(event.payload));
		await session.step();
		expect(started[0]).toMatchObject({ goalDial: { knob: 'threshold', value: 0.7 } });
	});

	it('with no setting, the default; a v1 spec, too', () => {
		const seen: WorldCreateOptions[] = [];
		const clock = createTestClock();
		createSession({
			spec: v1('11111111-1111-4111-8111-111111111111'),
			registry: registryWith(recordingWorld(seen)),
			provider: createMockProvider({ script: [] }),
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		expect(seen[0]?.config).toEqual({ knobs: { threshold: 0.5 } });
	});

	it('in a session group, once for the shared root, from the first member', () => {
		const seen: WorldCreateOptions[] = [];
		const clock = createTestClock();
		createSessionGroup({
			members: [
				{
					spec: withDial('11111111-1111-4111-8111-111111111111', 0.9),
					provider: createMockProvider({ script: [] })
				},
				{
					spec: withDial('22222222-2222-4222-8222-222222222222', 0.1),
					provider: createMockProvider({ script: [] })
				}
			],
			registry: registryWith(recordingWorld(seen)),
			goalCardId: 'rec/goal',
			options: { now: clock.now, newId: clock.newId, random: clock.random }
		});
		expect(seen).toHaveLength(1);
		expect(seen[0]?.config).toEqual({ knobs: { threshold: 0.9 } });
	});
});
