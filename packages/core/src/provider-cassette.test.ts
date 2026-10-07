import { describe, expect, it, vi } from 'vitest';
import { createPackRegistry } from './pack-registry.js';
import { REPLAY_DIVERGED, createRecordingReplay, pathDigestOf } from './recording-replay.js';
import {
	PROVIDER_CASSETTE_MISS,
	RecordingTape,
	createCassetteProvider,
	mergeProviderEntries,
	recordingProvider,
	type TappedCall
} from './provider-cassette.js';
import type { AgentSpec } from './schemas/agent-spec.js';
import type { EngineEvent } from './schemas/events.js';
import {
	cellKeyOf,
	parseAnyProviderCassette,
	parseProviderCassette,
	parseProviderRecording,
	promptDigest,
	type ProviderCassetteFile,
	type ProviderRecordingFile
} from './schemas/provider-cassette.js';
import { computeTraceDigest } from './schemas/trace-file.js';
import { createSession } from './session/agent-session.js';
import { createMockProvider, createTestClock, turn, v1BrickKinds } from './testing/index.js';
import type { ChatRequest, LLMProvider } from './types/provider.js';
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

async function runWith(
	provider: LLMProvider,
	withSpec: (spec: AgentSpec) => AgentSpec = (held) => held
): Promise<EngineEvent[]> {
	const clock = createTestClock();
	const events: EngineEvent[] = [];
	const session = createSession({
		spec: withSpec(spec),
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

	it('the tap is passive: a recorded session, slim and listened to, has the trace digest of an unrecorded one', async () => {
		const plain = await runWith(createMockProvider({ script: PLAN }));
		const tape = new RecordingTape();
		const recording = recordingProvider(createMockProvider({ script: PLAN }), {
			slim: true,
			onCall: tape.cell('c', 0).open('agent', 'tally/goal')
		});
		const recorded = await runWith(recording.provider);
		expect(await computeTraceDigest(recorded)).toBe(await computeTraceDigest(plain));
		const cell = tape.cells.get('c');
		expect(cell?.calls.map((call) => [call.seq, call.role, call.stage, call.segment])).toEqual([
			[0, 'agent', 'tally/goal', 0],
			[1, 'agent', 'tally/goal', 0],
			[2, 'agent', 'tally/goal', 0]
		]);
		expect(cell?.calls.every((call) => /^[0-9a-f]{64}$/.test(call.promptDigest))).toBe(true);
	});

	it('the tap keeps a failed call — its kind, message and retry hint, and the unit — and rethrows the error unchanged', async () => {
		const failure = Object.assign(new Error('The Spark timed out.'), {
			kind: 'timeout',
			retryAfterMs: 1500
		});
		const inner: LLMProvider = {
			...createMockProvider({ script: [turn('hello', 'ping')] }),
			chat: (_request, opts) => {
				opts.onServed?.('spark-ef08');
				return Promise.reject(failure);
			}
		};
		const told: TappedCall[] = [];
		const recording = recordingProvider(inner, { onCall: (call) => told.push(call) });
		const request = { model: 'm', messages: [], temperature: 0, maxTokens: 8 };
		await expect(
			recording.provider.chat(request, { signal: new AbortController().signal })
		).rejects.toBe(failure);
		expect(told).toHaveLength(1);
		expect(told[0]).toMatchObject({
			model: 'm',
			unit: 'spark-ef08',
			temperature: 0,
			maxTokens: 8,
			error: { kind: 'timeout', message: 'The Spark timed out.', retryAfterMs: 1500 }
		});
		expect(told[0]?.response).toBeUndefined();
		// A failed call is no cassette entry: nothing was answered.
		expect(recording.entries).toHaveLength(0);
	});

	it('a tape counts which time each stage’s provider was made, and numbers the calls across roles', () => {
		const tape = new RecordingTape();
		const cell = tape.cell('k', 1);
		const call = {
			promptDigest: 'a'.repeat(64),
			model: 'm',
			latencyMs: 1,
			error: { kind: 'x', message: 'y' }
		};
		cell.open('agent', 'stage-a')(call);
		cell.open('seat', 'stage-a')(call);
		cell.open('agent', 'stage-a')(call);
		expect(cell.calls.map((c) => `${c.seq}:${c.role}:${c.segment}`)).toEqual([
			'0:agent:0',
			'1:seat:0',
			'2:agent:1'
		]);
		expect(tape.cell('k', 1)).toBe(cell);
		expect(cell.trial).toBe(1);
	});

	it('a slim recording drops the raw wire chunks from the entry written, and leaves the session’s response whole', async () => {
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
		expect(seen.raw).toEqual(wire);
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

describe('the cell-scoped recording (WP189)', () => {
	const call = (extra: Record<string, unknown>) => ({
		seq: 0,
		role: 'agent' as const,
		stage: 'tally/goal',
		segment: 0,
		promptDigest: 'b'.repeat(64),
		model: 'm',
		latencyMs: 5,
		...extra
	});
	const file = (cells: unknown[]) => ({
		format: 'craftabot-cassette',
		formatVersion: 2,
		kind: 'provider-recording',
		providerId: 'mock',
		recordedAt: '2026-10-07T09:00:00.000Z',
		recordedBy: 'provider-cassette.test',
		egress: [],
		manifest: {
			campaignDigests: {},
			packVersions: {},
			sampling: [],
			models: [],
			units: [],
			trials: 1,
			interventions: []
		},
		cells
	});
	const answer = {
		text: 'hi',
		toolCall: null,
		usage: { inputTokens: 1, outputTokens: 1 },
		raw: null,
		finishReason: 'stop' as const
	};

	it('tells a version 2 recording from a version 1 cassette by its kind, and parses each as itself', () => {
		const two = parseAnyProviderCassette(
			file([{ cellKey: 'c', trial: 0, calls: [call({ response: answer })] }])
		);
		expect(two.version).toBe(2);
		const one = parseAnyProviderCassette(cassetteOf([]));
		expect(one.version).toBe(1);
	});

	it('holds a call to a response or an error, never both and never neither', () => {
		const bad = (extra: Record<string, unknown>) =>
			parseAnyProviderCassette(file([{ cellKey: 'c', trial: 0, calls: [call(extra)] }]));
		expect(() => bad({})).toThrow();
		expect(() => bad({ response: answer, error: { kind: 'x', message: 'y' } })).toThrow();
		expect(() => bad({ error: { kind: 'timeout', message: 'slow' } })).not.toThrow();
	});

	it('keys a cell by its inputs, not its place: the trial and every axis move the key', () => {
		const base = { campaignId: 'k', scenario: 's', build: 'b', guard: 'g', brain: 'live', seed: 3 };
		const key = cellKeyOf(base);
		expect(cellKeyOf({ ...base })).toBe(key);
		expect(cellKeyOf({ ...base, trial: 0 })).toBe(key);
		for (const moved of [
			{ trial: 1 },
			{ seed: 4 },
			{ item: 'i' },
			{ context: 'c' },
			{ guard: 'none' },
			{ brain: 'other' }
		])
			expect(cellKeyOf({ ...base, ...moved })).not.toBe(key);
	});
});

describe('exact replay of a recording (WP190)', () => {
	/** Record a session through the tap and make the one-cell recording file a replay is handed. */
	async function recordCell(
		provider: LLMProvider,
		cellKey = 'k|s|b|g|live|||0|0'
	): Promise<{ file: ProviderRecordingFile; events: EngineEvent[]; first: ChatRequest }> {
		const tape = new RecordingTape();
		let first: ChatRequest | undefined;
		const watched: LLMProvider = {
			...provider,
			chat: (request, opts) => {
				first ??= request;
				return provider.chat(request, opts);
			}
		};
		const recording = recordingProvider(watched, {
			slim: true,
			now: () => 0,
			onCall: tape.cell(cellKey, 0).open('agent', 'tally/goal')
		});
		const events = await runWith(recording.provider);
		const cell = tape.cells.get(cellKey)!;
		return {
			events,
			first: first!,
			file: parseProviderRecording({
				format: 'craftabot-cassette',
				formatVersion: 2,
				kind: 'provider-recording',
				providerId: 'mock',
				recordedAt: '2026-10-07T09:00:00.000Z',
				recordedBy: 'provider-cassette.test',
				egress: [],
				manifest: {
					campaignDigests: {},
					packVersions: {},
					sampling: [],
					models: [],
					units: [],
					trials: 1,
					interventions: []
				},
				cells: [
					{
						cellKey,
						trial: 0,
						pathDigest: pathDigestOf([events]),
						calls: cell.calls
					}
				]
			})
		};
	}

	it('replays a recorded cell to the path it took: the same path digest, every call answered', async () => {
		const { file, events } = await recordCell(createMockProvider({ script: PLAN }));
		const replay = createRecordingReplay(file).forCell(file.cells[0]!.cellKey);
		const replayed = await runWith(replay.providerFor('agent', 'tally/goal'));
		expect(pathDigestOf([replayed])).toBe(pathDigestOf([events]));
		expect(replay.report()).toMatchObject({ total: 3, consumed: 3, unused: 0 });
		expect(replay.report().diverged).toBeUndefined();
		// A second replay starts from the beginning, with its own cursors.
		const again = createRecordingReplay(file).forCell(file.cells[0]!.cellKey);
		expect(pathDigestOf([await runWith(again.providerFor('agent', 'tally/goal'))])).toBe(
			file.cells[0]!.pathDigest
		);
	});

	it('a prompt the recording did not make is replay-diverged, with both digests, and nothing is substituted', async () => {
		const { file } = await recordCell(createMockProvider({ script: PLAN }));
		// Another token cap: every request the bot makes is a different request from the one recorded.
		const replay = createRecordingReplay(file).forCell(file.cells[0]!.cellKey);
		const events = await runWith(replay.providerFor('agent', 'tally/goal'), (held) => ({
			...held,
			bricks: { ...held.bricks, llm: { ...held.bricks.llm!, maxTokens: 65 } }
		}));
		const error = events.find((event) => event.type === 'error');
		expect(error?.payload).toMatchObject({ kind: REPLAY_DIVERGED });
		expect(String((error?.payload as { message: string }).message)).toContain('asked prompt');
		const report = replay.report();
		expect(report.diverged).toMatchObject({
			seq: 0,
			expected: file.cells[0]!.calls[0]!.promptDigest
		});
		expect(report.consumed).toBe(0);
	});

	it('a call that failed when recorded fails again as it did, and the recording keeps what followed', async () => {
		let asked = 0;
		const flaky: LLMProvider = {
			...createMockProvider({ script: PLAN }),
			chat: (request, opts) => {
				asked += 1;
				if (asked === 1)
					return Promise.reject(
						Object.assign(new Error('The Spark timed out.'), { kind: 'timeout' })
					);
				return createMockProvider({ script: PLAN }).chat(request, opts);
			}
		};
		const { file } = await recordCell(flaky);
		const calls = file.cells[0]!.calls;
		expect(calls[0]?.error).toMatchObject({ kind: 'timeout', message: 'The Spark timed out.' });
		const replay = createRecordingReplay(file).forCell(file.cells[0]!.cellKey);
		const events = await runWith(replay.providerFor('agent', 'tally/goal'));
		expect(events.find((event) => event.type === 'error')?.payload).toMatchObject({
			kind: 'timeout'
		});
		expect(replay.report().diverged).toBeUndefined();
	});

	it('says how many recorded calls the replay never asked for', async () => {
		const { file, first } = await recordCell(createMockProvider({ script: PLAN }));
		const replay = createRecordingReplay(file).forCell(file.cells[0]!.cellKey);
		const provider = replay.providerFor('agent', 'tally/goal');
		await provider.chat(first, { signal: new AbortController().signal });
		expect(replay.report()).toMatchObject({ total: 3, consumed: 1, unused: 2 });
	});

	it('the path digest ignores wall-clock fields and wire detail, and sees a changed decision', async () => {
		const events = await runWith(createMockProvider({ script: PLAN }));
		const base = pathDigestOf([events]);
		// Timestamps, the provider's time and a streamed token are off the path.
		const later = events.map((event) => ({ ...event, timestamp: '2030-01-01T00:00:00.000Z' }));
		expect(pathDigestOf([later])).toBe(base);
		const withoutTokens = events.filter((event) => event.type !== 'think.token');
		expect(pathDigestOf([withoutTokens])).toBe(base);
		// A different decision is a different path.
		const changed = events.map((event) =>
			event.type === 'decision'
				? { ...event, payload: { ...event.payload, thought: 'a different thought' } }
				: event
		) as EngineEvent[];
		expect(pathDigestOf([changed])).not.toBe(base);
		// And so is a run that stopped sooner.
		expect(pathDigestOf([events.slice(0, -2)])).not.toBe(base);
	});

	it('the workflow part is read by what each stage decided, not by the run ids it names', async () => {
		const events = await runWith(createMockProvider({ script: PLAN }));
		const stages = (runId: string, outcome: string) => [
			{ stageId: 'a', status: 'completed', runId, runIds: [runId], outcome, durationMs: 5 }
		];
		const base = pathDigestOf([events], { events: [], stages: stages('run-1', 'done') });
		// The same stages under other run ids and another wall-clock time are the same path.
		const renumbered = pathDigestOf([events], {
			events: [],
			stages: [{ ...stages('run-9', 'done')[0]!, durationMs: 900 }]
		});
		expect(renumbered).toBe(base);
		// A stage that ended differently is not.
		expect(pathDigestOf([events], { events: [], stages: stages('run-1', 'stopped') })).not.toBe(
			base
		);
	});
});
