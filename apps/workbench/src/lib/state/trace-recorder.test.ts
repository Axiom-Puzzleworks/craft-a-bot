import { createSession, type AgentSpec } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient, turn } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { createRegistry } from '../packs.js';
import { createMemoryStorage } from './storage-memory.js';
import { recordTrace } from './trace-recorder.js';

const RUN_ID = '22222222-2222-4222-8222-222222222222';

function testRegistry() {
	const registry = createRegistry();
	registry.registerPack({
		id: 'test',
		name: 'Test cartridges',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		cartridges: [
			{
				id: 'test/mock-brain',
				providerId: 'mock',
				model: 'mock-1',
				displayName: 'Mock Brain',
				blurb: 'Scripted.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 256 }
			}
		]
	});
	return registry;
}

function makeSpec(): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Testbot',
		bricks: {
			llm: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' },
			sense: { channels: ['sight'] },
			actions: { enabled: ['move', 'say'] }
		},
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};
}

function makeSession(script: Parameters<typeof createMockProvider>[0]['script']) {
	const clock = createTestClock();
	return createSession({
		spec: makeSpec(),
		registry: testRegistry(),
		provider: createMockProvider({ script }),
		guardrails: [],
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});
}

describe('the trace recorder', () => {
	it('persists every event a run emits, in order', async () => {
		const storage = createMemoryStorage();
		const session = makeSession(
			obedient([
				{ say: 'East.', call: 'move', args: { direction: 'east' } },
				{ say: 'East again.', call: 'move', args: { direction: 'east' } },
				{ say: 'And again.', call: 'move', args: { direction: 'east' } },
				{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy!' } }
			])
		);
		const recorder = recordTrace(RUN_ID, storage);
		session.events.onAny(recorder.accept);

		session.start('step');
		for (let step = 0; step < 10; step++) {
			const result = await session.step();
			if (result.outcome) break;
		}
		await recorder.stop();

		const stored = await storage.getEvents(RUN_ID);
		expect(stored.length).toBeGreaterThan(10);
		expect(stored.map((row) => row.seq)).toEqual(stored.map((_row, index) => index));
		expect(stored[0]?.event.type).toBe('run.started');
		expect(stored.at(-1)?.event.type).toBe('run.finished');
	});

	it('mirrors the same events in memory for the UI to read', async () => {
		const storage = createMemoryStorage();
		const session = makeSession([turn('East.', 'move', { direction: 'east' })]);
		const recorder = recordTrace(RUN_ID, storage);
		session.events.onAny(recorder.accept);

		session.start('step');
		await session.step();
		await recorder.stop();

		const stored = await storage.getEvents(RUN_ID);
		expect(recorder.events().map((event) => event.id)).toEqual(stored.map((row) => row.event.id));
	});

	it('flushes on run.finished without waiting to be told', async () => {
		const storage = createMemoryStorage();
		const session = makeSession(
			obedient([
				{ say: 'East.', call: 'move', args: { direction: 'east' } },
				{ say: 'East again.', call: 'move', args: { direction: 'east' } },
				{ say: 'And again.', call: 'move', args: { direction: 'east' } },
				{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy!' } }
			])
		);
		const recorder = recordTrace(RUN_ID, storage, { batchSize: 1000 });
		session.events.onAny(recorder.accept);

		session.start('step');
		for (let step = 0; step < 10; step++) {
			const result = await session.step();
			if (result.outcome) break;
		}
		await recorder.flush();

		expect((await storage.getEvents(RUN_ID)).at(-1)?.event.type).toBe('run.finished');
	});

	it('keeps seq contiguous across many small batches', async () => {
		const storage = createMemoryStorage();
		const session = makeSession(
			obedient([
				{ say: 'East.', call: 'move', args: { direction: 'east' } },
				{ say: 'East again.', call: 'move', args: { direction: 'east' } },
				{ say: 'And again.', call: 'move', args: { direction: 'east' } },
				{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy!' } }
			])
		);
		// batchSize 1 forces an append per event — the worst case for ordering.
		const recorder = recordTrace(RUN_ID, storage, { batchSize: 1 });
		session.events.onAny(recorder.accept);

		session.start('step');
		for (let step = 0; step < 10; step++) {
			const result = await session.step();
			if (result.outcome) break;
		}
		await recorder.stop();

		const seqs = (await storage.getEvents(RUN_ID)).map((row) => row.seq);
		expect(seqs).toEqual(seqs.map((_value, index) => index));
	});

	it('refuses events once stopped', async () => {
		const storage = createMemoryStorage();
		const session = makeSession(() => turn('East.', 'move', { direction: 'east' }));
		const recorder = recordTrace(RUN_ID, storage);
		session.events.onAny(recorder.accept);

		session.start('step');
		await session.step();
		await recorder.stop();
		const afterStop = (await storage.getEvents(RUN_ID)).length;

		await session.step();
		await recorder.flush();
		expect(await storage.getEvents(RUN_ID)).toHaveLength(afterStop);
	});

	it('flushing an empty buffer is harmless', async () => {
		const storage = createMemoryStorage();
		const session = makeSession([]);
		const recorder = recordTrace(RUN_ID, storage);
		session.events.onAny(recorder.accept);
		await expect(recorder.flush()).resolves.toBeUndefined();
	});
});
