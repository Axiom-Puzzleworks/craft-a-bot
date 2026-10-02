import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import { createCassetteProvider, recordingProvider, timedProvider } from '../provider-cassette.js';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
import { parseEngineEvent } from '../schemas/events.js';
import type { ProviderCassetteFile } from '../schemas/provider-cassette.js';
import type { SeatLine } from '../schemas/shared.js';
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
 * **A live run's own sensors** (WP160, `112-REAL-ENOUGH-PLAN.md` §5): the dials
 * a call went out with, how long it took, the roll behind a planted fault, and
 * the visitor's line written beside the action it answered. Each is written
 * only when there is something to say, so a mock's trace is as it was.
 */
const SEAT: SeatLine = {
	persona: 'Mr Okafor',
	cue: { kind: 'acted', detail: 'decide' },
	ruleId: 'thanks',
	text: 'Thank you, that is all I needed.',
	then: 'end-conversation',
	pressure: 0.2,
	tags: ['polite']
};

const world: WorldDefinition = {
	id: 'live/world',
	name: 'Live',
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
				return { ok: true, narration: 'decided', stateDiff: [], seatLines: [SEAT] };
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
		id: 'live',
		name: 'Live',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [world],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'live/brain',
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
				id: 'live/goal',
				title: 'Decide',
				goalText: 'Decide.',
				worldId: 'live/world',
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
	name: 'Livebot',
	bricks: {
		llm: { cartridgeId: 'live/brain', temperature: 0.7, maxTokens: 300, personality: '' },
		sense: { channels: ['look'] },
		actions: { enabled: ['decide'] }
	},
	goalCardId: 'live/goal',
	createdAt: '2026-10-02T09:00:00Z',
	updatedAt: '2026-10-02T09:00:00Z',
	schemaVersion: 1
};

async function run(
	first: MockTurn,
	provider = createMockProvider({ script: [first] })
): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const session = createSession({
		spec,
		registry: registry(),
		provider,
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});
	session.events.onAny((event) => events.push(event));
	await session.step();
	return events;
}

const decide = turn('Deciding.', 'decide', { outcome: 'decline' });
const of = (events: EngineEvent[], type: EngineEvent['type']) =>
	events.find((event) => event.type === type)?.payload as Record<string, unknown> | undefined;

describe('the live run’s own sensors (WP160)', () => {
	it('writes the dials a call went out with on think.started', async () => {
		const events = await run(decide);
		expect(of(events, 'think.started')?.['parameters']).toEqual({
			temperature: 0.7,
			maxTokens: 300
		});
	});

	it('writes durationMs only when the response carries a timing', async () => {
		const timed = await run({ ...decide, latencyMs: 1234 });
		expect(of(timed, 'think.completed')?.['durationMs']).toBe(1234);
		const untimed = await run(decide);
		expect(of(untimed, 'think.completed')).not.toHaveProperty('durationMs');
	});

	it('copies the roll behind a planted fault onto decision.fault', async () => {
		const events = await run({
			...decide,
			fault: {
				field: 'outcome',
				chose: 'decline',
				shouldHave: 'approve',
				draw: { rate: 0.1, roll: 0.03 }
			}
		});
		expect(of(events, 'decision.fault')?.['draw']).toEqual({ rate: 0.1, roll: 0.03 });
	});

	it('writes a seat.said for each line the visitor said, after the action it answered', async () => {
		const events = await run(decide);
		const at = events.findIndex((event) => event.type === 'seat.said');
		expect(events[at - 1]?.type).toBe('action.performed');
		expect(events[at]?.payload).toEqual(SEAT);
		expect(events.filter((event) => event.type === 'seat.said')).toHaveLength(1);
		for (const event of events) expect(() => parseEngineEvent(event)).not.toThrow();
	});

	it('times a live provider’s call, and leaves a mock’s response alone', async () => {
		let tick = 0;
		const timed = timedProvider(createMockProvider({ script: [decide] }), () => (tick += 40));
		const events = await run(decide, timed);
		expect(of(events, 'think.completed')?.['durationMs']).toBe(40);
		expect(of(await run(decide), 'think.completed')).not.toHaveProperty('durationMs');
	});

	it('a replay reproduces the recording’s own durations, so the digests agree', async () => {
		let tick = 0;
		const recording = recordingProvider(createMockProvider({ script: [decide] }), {
			now: () => (tick += 25)
		});
		const recorded = await run(decide, recording.provider);
		expect(of(recorded, 'think.completed')?.['durationMs']).toBe(25);
		const cassette: ProviderCassetteFile = {
			format: 'craftabot-cassette',
			formatVersion: 1,
			kind: 'provider',
			providerId: 'mock',
			recordedAt: '2026-10-02T09:00:00Z',
			recordedBy: 'test',
			note: 'a test recording',
			egress: [],
			entries: recording.entries
		};
		const replayed = await run(decide, createCassetteProvider(cassette));
		expect(of(replayed, 'think.completed')?.['durationMs']).toBe(25);
		expect(replayed.map((event) => event.payload)).toEqual(recorded.map((event) => event.payload));
	});
});
