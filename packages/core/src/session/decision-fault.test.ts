import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import {
	createMockProvider,
	createTestClock,
	turn,
	v1BrickKinds,
	type MockTurn
} from '../testing/index.js';
import type { WorldDefinition } from '../types/world.js';
import { createSession } from './agent-session.js';

/**
 * **`decision.fault`** (WP115, `103-FALLIBLE-ACTORS.md` §5; `02-…` §7): a
 * response carrying a planted fault is followed, right after its `decision`,
 * by `decision.fault` — with the error model when one is named, without it
 * when none is — and a response without one writes nothing new.
 */
const world: WorldDefinition = {
	id: 'fault/world',
	name: 'Fault',
	layouts: [{ id: 'a', name: 'A', initialState: {} }],
	actions: [
		{ id: 'decide', name: 'Decide', description: 'Decide.', parameters: { type: 'object' } }
	],
	senses: [{ id: 'look', name: 'Look', description: 'Look.' }],
	predicates: { decided: 'Decided.' },
	create() {
		let decided = false;
		return {
			snapshot: () => ({ decided }),
			observe: (channels) => ({ channels: [...channels], text: 'a case' }),
			perform: () => {
				decided = true;
				return { ok: true, narration: 'decided', stateDiff: [] };
			},
			test: () => decided,
			reset: () => {
				decided = false;
			}
		};
	}
};

function registry() {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'fault',
		name: 'Fault',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [world],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'fault/brain',
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
				id: 'fault/goal',
				title: 'Decide',
				goalText: 'Decide.',
				worldId: 'fault/world',
				layoutId: 'a',
				successCondition: 'decided',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

const spec: AgentSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Faultbot',
	bricks: {
		llm: { cartridgeId: 'fault/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['look'] },
		actions: { enabled: ['decide'] }
	},
	goalCardId: 'fault/goal',
	createdAt: '2026-09-29T09:00:00Z',
	updatedAt: '2026-09-29T09:00:00Z',
	schemaVersion: 1
};

async function run(first: MockTurn): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const session = createSession({
		spec,
		registry: registry(),
		provider: createMockProvider({ script: [first] }),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});
	session.events.onAny((event) => events.push(event));
	await session.step();
	return events;
}

const decide = turn('Deciding.', 'decide', { outcome: 'decline' });

describe('decision.fault (WP115)', () => {
	it('follows the decision it corrupts, naming the error model', async () => {
		const events = await run({
			...decide,
			fault: { field: 'outcome', chose: 'decline', shouldHave: 'approve', errorModel: 'm/err' }
		});
		const at = events.findIndex((event) => event.type === 'decision.fault');
		expect(events[at - 1]?.type).toBe('decision');
		expect(events[at]?.payload).toEqual({
			action: 'decide',
			field: 'outcome',
			chose: 'decline',
			shouldHave: 'approve',
			planted: true,
			errorModel: 'm/err'
		});
	});

	it('writes no error model when none was named, and nothing at all without a fault', async () => {
		const unnamed = await run({
			...decide,
			fault: { field: 'outcome', chose: 'decline', shouldHave: 'approve' }
		});
		expect(unnamed.find((event) => event.type === 'decision.fault')?.payload).not.toHaveProperty(
			'errorModel'
		);
		const plain = await run(decide);
		expect(plain.some((event) => event.type === 'decision.fault')).toBe(false);
	});
});
