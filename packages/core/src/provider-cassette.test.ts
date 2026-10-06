import { describe, expect, it, vi } from 'vitest';
import { createPackRegistry } from './pack-registry.js';
import {
	PROVIDER_CASSETTE_MISS,
	createCassetteProvider,
	mergeProviderEntries,
	recordingProvider
} from './provider-cassette.js';
import type { AgentSpec } from './schemas/agent-spec.js';
import type { EngineEvent } from './schemas/events.js';
import {
	parseProviderCassette,
	promptDigest,
	type ProviderCassetteFile
} from './schemas/provider-cassette.js';
import { computeTraceDigest } from './schemas/trace-file.js';
import { createSession } from './session/agent-session.js';
import { createMockProvider, createTestClock, turn, v1BrickKinds } from './testing/index.js';
import type { LLMProvider } from './types/provider.js';
import type { WorldDefinition } from './types/world.js';

/**
 * **The provider cassette** (WP114, `103-FALLIBLE-ACTORS.md` §3): a session
 * recorded through the mock provider replays from its cassette to the same
 * trace digest; a prompt the cassette has not seen is a `cassette-miss` on the
 * trace and nothing is sent; every entry pins its model; many cells' entries
 * merge first-answer-wins.
 */
const world: WorldDefinition = {
	id: 'tally/world',
	name: 'Tally',
	layouts: [{ id: 'a', name: 'A', initialState: {} }],
	actions: [
		{ id: 'ping', name: 'Ping', description: 'Count one.', parameters: { type: 'object' } },
		{ id: 'win', name: 'Win', description: 'Finish.', parameters: { type: 'object' } }
	],
	senses: [{ id: 'look', name: 'Look', description: 'See the tally.' }],
	predicates: { won: 'Won.' },
	create() {
		const state = { pings: 0, won: false };
		return {
			snapshot: () => ({ ...state }),
			observe: (channels) => ({ channels: [...channels], text: `pings: ${state.pings}` }),
			perform: (call) => {
				if (call.name === 'ping') state.pings += 1;
				if (call.name === 'win') state.won = true;
				return { ok: true, narration: `${call.name}!`, stateDiff: [] };
			},
			test: () => state.won,
			reset: () => {
				state.pings = 0;
				state.won = false;
			}
		};
	}
};

function registry() {
	const registry = createPackRegistry();
	registry.registerPack({
		id: 'tally',
		name: 'Tally',
		version: '1.0.0',
		requiresCore: '>=1.0.0',
		worlds: [world],
		brickKinds: v1BrickKinds(),
		cartridges: [
			{
				id: 'tally/brain',
				providerId: 'mock',
				model: 'tally-model-1',
				displayName: 'T',
				blurb: '.',
				stats: { words: 1, reasoning: 1, speed: 3 },
				costHint: 'low',
				defaults: { temperature: 0, maxTokens: 64 }
			}
		],
		goalCards: [
			{
				id: 'tally/goal',
				title: 'Win',
				goalText: 'Ping twice, then win.',
				worldId: 'tally/world',
				layoutId: 'a',
				successCondition: 'won',
				hints: [],
				teachesConcepts: []
			}
		]
	});
	return registry;
}

const spec: AgentSpec = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Tallybot',
	bricks: {
		llm: { cartridgeId: 'tally/brain', temperature: 0, maxTokens: 64, personality: '' },
		sense: { channels: ['look'] },
		actions: { enabled: ['ping', 'win'] }
	},
	goalCardId: 'tally/goal',
	createdAt: '2026-09-29T09:00:00Z',
	updatedAt: '2026-09-29T09:00:00Z',
	schemaVersion: 1
};

const PLAN = [turn('Once.', 'ping'), turn('Twice.', 'ping'), turn('Done.', 'win')];

async function runWith(provider: LLMProvider): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const session = createSession({
		spec,
		registry: registry(),
		provider,
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});
	session.events.onAny((event) => events.push(event));
	for (let i = 0; i < 6 && !events.some((event) => event.type === 'run.finished'); i += 1)
		await session.step();
	return events;
}

function cassetteOf(entries: ProviderCassetteFile['entries']): ProviderCassetteFile {
	return parseProviderCassette({
		format: 'craftabot-cassette',
		formatVersion: 1,
		kind: 'provider',
		providerId: 'mock',
		recordedAt: '2026-09-29T09:00:00.000Z',
		recordedBy: 'provider-cassette.test',
		note: 'recorded from the mock provider',
		egress: [],
		entries
	});
}

describe('the provider cassette (WP114)', () => {
	it('a run recorded through the mock provider replays from its cassette to the same trace digest', async () => {
		const plain = await runWith(createMockProvider({ script: PLAN }));
		const recording = recordingProvider(createMockProvider({ script: PLAN }));
		const recorded = await runWith(recording.provider);
		expect(await computeTraceDigest(recorded)).toBe(await computeTraceDigest(plain));
		expect(recording.entries).toHaveLength(3);
		expect(recording.entries.every((entry) => entry.model === 'tally-model-1')).toBe(true);

		const replayed = await runWith(createCassetteProvider(cassetteOf(recording.entries)));
		expect(await computeTraceDigest(replayed)).toBe(await computeTraceDigest(recorded));
		expect(replayed.some((event) => event.type === 'run.finished')).toBe(true);
	});

	it('a prompt the cassette has not seen is a cassette-miss on the trace, and nothing is sent', async () => {
		const recording = recordingProvider(createMockProvider({ script: PLAN }));
		await runWith(recording.provider);
		// Only the first answer: the second prompt is one the cassette never heard.
		const fetch = vi.fn();
		vi.stubGlobal('fetch', fetch);
		try {
			const events = await runWith(
				createCassetteProvider(cassetteOf(recording.entries.slice(0, 1)))
			);
			const error = events.find((event) => event.type === 'error');
			expect(error?.payload).toMatchObject({ kind: PROVIDER_CASSETTE_MISS });
			expect(fetch).not.toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('pins the model: the same prompt to another model is a miss', async () => {
		const recording = recordingProvider(createMockProvider({ script: PLAN }));
		await runWith(recording.provider);
		const entries = recording.entries.map((entry) => ({ ...entry, model: 'another-model' }));
		const events = await runWith(createCassetteProvider(cassetteOf(entries)));
		expect(events.find((event) => event.type === 'error')?.payload).toMatchObject({
			kind: PROVIDER_CASSETTE_MISS
		});
	});

	it('keys by the prompt: any change to what reaches the provider moves the digest', () => {
		const request = {
			model: 'm',
			messages: [{ role: 'user' as const, content: 'hi' }],
			temperature: 0,
			maxTokens: 64
		};
		const digest = promptDigest(request);
		expect(digest).toMatch(/^[0-9a-f]{64}$/);
		expect(promptDigest({ ...request })).toBe(digest);
		expect(promptDigest({ ...request, temperature: 0.2 })).not.toBe(digest);
		expect(promptDigest({ ...request, model: 'n' })).not.toBe(digest);
	});

	it('a slim recording drops the raw wire chunks from the entry and from what the session sees, and keeps the rest', async () => {
		const wire = { chunks: [{ choices: [{ delta: { content: 'hi' } }] }] };
		const inner: LLMProvider = {
			...createMockProvider({ script: [turn('hello', 'ping')] }),
			chat: async () => ({
				text: 'hello',
				toolCall: null,
				usage: { inputTokens: 3, outputTokens: 1 },
				raw: wire,
				finishReason: 'stop'
			})
		};
		const request = { model: 'm', messages: [], temperature: 0, maxTokens: 8 };
		const opts = { signal: new AbortController().signal };
		const full = recordingProvider(inner);
		const slim = recordingProvider(inner, { slim: true });
		expect((await full.provider.chat(request, opts)).raw).toEqual(wire);
		expect(full.entries[0]?.response.raw).toEqual(wire);
		const seen = await slim.provider.chat(request, opts);
		expect(seen.raw).toBeNull();
		expect(slim.entries[0]?.response).toMatchObject({ text: 'hello', usage: { inputTokens: 3 } });
		expect(slim.entries[0]?.response.raw).toBeNull();
	});

	it('merges many cells’ recordings first-answer-wins, and counts the answers that differed', () => {
		const entry = (text: string, occurrence = 0) => ({
			promptDigest: 'a'.repeat(64),
			occurrence,
			model: 'm',
			response: {
				text,
				toolCall: null,
				usage: { inputTokens: 1, outputTokens: 1 },
				raw: null,
				finishReason: 'stop' as const
			},
			latencyMs: 0
		});
		const merged = mergeProviderEntries([
			[entry('yes')],
			[entry('yes'), entry('again', 1)],
			[entry('no')]
		]);
		expect(merged.entries.map((kept) => kept.response.text)).toEqual(['yes', 'again']);
		expect(merged.conflicts).toBe(1);
	});
});
