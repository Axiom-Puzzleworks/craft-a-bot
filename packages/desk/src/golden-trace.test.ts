import {
	createPackRegistry,
	createSession,
	safeParseEngineEvent,
	type AgentSpec,
	type EngineEvent,
	type PackRegistry
} from '@craftabot/core';
import {
	createMockProvider,
	createTestClock,
	obedient,
	v1BrickKinds
} from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { TEST_DESK_ID, testDesk } from './test-desk.js';

/**
 * The desk golden trace (`43-…` §4.5): a scripted run over the test desk
 * through the real engine, byte-identical to the committed fixture. From
 * stage B on this is the runtime's byte-stability oracle — a change that
 * moves a byte here is a version change with a fixture (`14-…` §7).
 *
 * Built the way `pack-starter`'s `trace-fixture.test.ts` and core's own
 * session tests build theirs: the shared `v1BrickKinds` stub, a mock
 * cartridge, the test clock. No pack is involved, so the oracle cannot move
 * when a pack's content does.
 */
function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'test',
		name: 'Test desk pack',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [testDesk],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'test/brain',
				providerId: 'mock',
				model: 'mock-1',
				displayName: 'Mock brain',
				blurb: 'Scripted.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'test/sign-in',
				title: 'Sign the visitor in',
				goalText: 'Find out who has come and sign them in.',
				worldId: TEST_DESK_ID,
				layoutId: 'one-visitor',
				successCondition: 'signed-in',
				hints: [],
				teachesConcepts: [],
				par: 3
			}
		]
	});
	return registry;
}

const SPEC: AgentSpec = {
	id: '33333333-3333-4333-8333-333333333333',
	name: 'Deskbot',
	bricks: {
		llm: { cartridgeId: 'test/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['conversation', 'case-file', 'queue'] },
		actions: { enabled: ['say', 'look-up', 'sign-in'] },
		memory: { windowSize: 10, notebook: false }
	},
	goalCardId: 'test/sign-in',
	createdAt: '2026-09-05T09:00:00Z',
	updatedAt: '2026-09-05T09:00:00Z',
	schemaVersion: 1
};

const PLAN = [
	{
		say: 'Someone is here. Hello.',
		call: 'say',
		args: { text: 'Hello, who are you here to see?' }
	},
	{ say: 'Let me open their record.', call: 'look-up', args: { record: 'visitor' } },
	{ say: 'Signing them in.', call: 'sign-in', args: { visitor: 'A. Person' } }
];

export async function runDeskMinimal(): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const session = createSession({
		spec: SPEC,
		registry: buildRegistry(),
		provider: createMockProvider({ script: obedient(PLAN) }),
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.start('step');
	for (let step = 0; step < 10; step++) {
		const result = await session.step();
		if (result.outcome) break;
	}
	return events;
}

describe('trace.desk-minimal.v1.json', () => {
	it('matches the committed fixture exactly', async () => {
		const events = await runDeskMinimal();
		await expect(JSON.stringify(events, null, '\t')).toMatchFileSnapshot(
			'./fixtures/trace.desk-minimal.v1.json'
		);
	});

	it('wins the card in three ticks, every event parsing through the catalogue', async () => {
		const events = await runDeskMinimal();
		const finished = events.find((event) => event.type === 'run.finished');
		expect(finished).toMatchObject({ payload: { outcome: 'SUCCESS' } });
		expect(events.filter((event) => event.type === 'tick.started')).toHaveLength(3);
		for (const event of events) {
			expect(safeParseEngineEvent(event).success, event.type).toBe(true);
		}
		const frames = events.filter((event) => event.type === 'world.changed');
		expect(frames.length).toBeGreaterThanOrEqual(4);
		const last = frames.at(-1)?.payload as {
			state: { transcript: unknown[]; queue: { status: string }[] };
		};
		expect(last.state.transcript).toHaveLength(2);
		expect(last.state.queue[0]?.status).toBe('decided');
	});

	it('reproduces byte-identically on a second run', async () => {
		expect(JSON.stringify(await runDeskMinimal())).toBe(JSON.stringify(await runDeskMinimal()));
	});
});
