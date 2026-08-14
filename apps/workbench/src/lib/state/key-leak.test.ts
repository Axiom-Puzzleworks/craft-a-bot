import 'fake-indexeddb/auto';
import {
	brickKindsFor,
	buildKitFile,
	buildTraceFile,
	containsSecret,
	createSession,
	toSpecV2,
	type AgentSpec,
	type RunRecord
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { describe, expect, it } from 'vitest';
import { createRegistry, packVersions } from '../packs.js';
import { createKeyVault } from './keys.js';
import { createMemoryStorage } from './storage-memory.js';
import { recordTrace } from './trace-recorder.js';

/**
 * **The key-leak gate** (WP4 definition of done; 06-LLM-PROVIDERS.md §6).
 *
 * Hard rule 2 says an API key must never appear in a kit file, a trace, an
 * event, an export, a log, or a URL. That is a claim about code that does not
 * exist yet as much as about code that does, so it is enforced here rather than
 * left to review: store a real-looking key, run a real agent end to end, export
 * everything the app can export, and assert the key is nowhere in any of it.
 *
 * If this test ever fails, something has started copying secrets around. Do not
 * relax the assertion — find what moved the key.
 */

/** Distinctive enough that a match cannot be a coincidence. */
const FAKE_KEY = 'sk-craftabot-test-DO-NOT-LEAK-3f9a2b7c';

function memoryWebStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		removeItem: (key: string) => void map.delete(key)
	};
}

function makeSpec(): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Snackbot 3000',
		bricks: {
			llm: {
				cartridgeId: 'test/mock-brain',
				temperature: 0,
				maxTokens: 256,
				personality: 'You are a cheerful little robot.'
			},
			memory: { windowSize: 10, notebook: true },
			tools: { enabled: ['starter/calculator'] },
			sense: { channels: ['sight', 'compass'] },
			actions: { enabled: ['move', 'say', 'celebrate'] }
		},
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 1
	};
}

const PLAN = [
	{ say: 'Let me head east to find Teddy.', call: 'move', args: { direction: 'east' } },
	{ say: 'Still going.', call: 'move', args: { direction: 'east' } },
	{ say: 'Nearly there.', call: 'move', args: { direction: 'east' } },
	{ say: 'Hello!', call: 'say', args: { text: 'Hello Teddy, I am your new robot!' } }
];

/** A full run: real registry, real Playroom, real storage, scripted brain. */
async function runAndExport() {
	const vault = createKeyVault(memoryWebStorage());
	vault.set('openai', FAKE_KEY);

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

	const clock = createTestClock();
	const spec = makeSpec();
	const storage = createMemoryStorage();
	const runId = '22222222-2222-4222-8222-222222222222';

	const session = createSession({
		spec,
		registry,
		provider: createMockProvider({ script: obedient(PLAN) }),
		guardrails: [],
		options: { now: clock.now, newId: clock.newId, random: clock.random }
	});

	const recorder = recordTrace(runId, storage);
	session.events.onAny(recorder.accept);
	session.start('step');
	for (let step = 0; step < 10; step++) {
		const result = await session.step();
		if (result.outcome) break;
	}
	await recorder.stop();

	const storedEvents = await storage.getEvents(runId);
	const run: RunRecord = {
		id: runId,
		agentId: spec.id,
		agentName: spec.name,
		goalCardId: spec.goalCardId,
		specSnapshot: spec,
		packVersions: packVersions(),
		mode: 'step',
		outcome: 'SUCCESS',
		ticks: 4,
		usage: { inputTokens: 100, outputTokens: 20 },
		budgets: { maxTicks: 30, maxTokens: 100000, requestTimeoutMs: 60000 },
		providerId: 'mock',
		wireModel: 'mock-1',
		pinned: false,
		startedAt: '2026-08-12T10:00:00Z',
		finishedAt: '2026-08-12T10:00:05Z',
		schemaVersion: 2
	};

	const secrets = vault.secrets();
	const kitFile = buildKitFile(spec, {
		exportedBy: 'craftabot-workbench/0.0.1',
		requires: {
			core: '>=0.0.1',
			packs: packVersions(),
			brickKinds: brickKindsFor(spec, registry)
		},
		secrets
	});
	const traceFile = await buildTraceFile(
		run,
		storedEvents.map((row) => row.event),
		{ secrets }
	);

	return { vault, storage, storedEvents, kitFile, traceFile, secrets };
}

describe('the key-leak gate', () => {
	it('runs the agent to completion, so the trace is a real one', async () => {
		const { storedEvents } = await runAndExport();
		expect(storedEvents.length).toBeGreaterThan(10);
		expect(storedEvents.at(-1)?.event.type).toBe('run.finished');
	});

	it('keeps the key out of every stored event', async () => {
		const { storedEvents, secrets } = await runAndExport();
		expect(containsSecret(storedEvents, secrets)).toBe(false);
	});

	it('keeps the key out of the exported kit file', async () => {
		const { kitFile, secrets } = await runAndExport();
		expect(containsSecret(kitFile, secrets)).toBe(false);
		expect(JSON.stringify(kitFile)).not.toContain(FAKE_KEY);
	});

	it('keeps the key out of the exported trace file', async () => {
		const { traceFile, secrets } = await runAndExport();
		expect(containsSecret(traceFile, secrets)).toBe(false);
		expect(JSON.stringify(traceFile)).not.toContain(FAKE_KEY);
	});

	it('keeps the key out of everything the app could hand to a user, in one sweep', async () => {
		const { storage, storedEvents, kitFile, traceFile } = await runAndExport();
		const everythingExportable = JSON.stringify({
			kitFile,
			traceFile,
			storedEvents,
			agents: await storage.listAgents(),
			runs: await storage.listRuns()
		});
		expect(everythingExportable).not.toContain(FAKE_KEY);
		expect(everythingExportable).not.toMatch(/sk-craftabot/);
	});

	it('still has the key in the vault — we are testing containment, not deletion', async () => {
		const { vault } = await runAndExport();
		expect(vault.get('openai')).toBe(FAKE_KEY);
	});

	it('would catch a leak: the same sweep fails when a key is deliberately planted', async () => {
		// Proves the assertions above can actually fail. Without this, a broken
		// `containsSecret` would make the whole gate silently vacuous.
		const { traceFile, secrets } = await runAndExport();
		const tampered = { ...traceFile, run: { ...traceFile.run, agentName: FAKE_KEY } };
		expect(containsSecret(tampered, secrets)).toBe(true);
	});

	/**
	 * The tests above verify the *primary* guarantee: a key never enters the data
	 * in the first place, so they pass even with redaction switched off entirely
	 * (verified by disabling it). These two cover the *backstop* — the scrub that
	 * catches a key which somehow got in anyway, which is what 07 §5 asks for.
	 */
	it('scrubs a key out of a trace export even if one reached the run record', async () => {
		const { storedEvents, secrets } = await runAndExport();
		const run: RunRecord = {
			...(await buildLeakyRun()),
			// Pretend a future bug copied the key into a stored field.
			agentName: FAKE_KEY
		};

		const traceFile = await buildTraceFile(
			run,
			storedEvents.map((row) => row.event),
			{ secrets }
		);
		expect(JSON.stringify(traceFile)).not.toContain(FAKE_KEY);
	});

	it('computes the trace digest over the redacted bytes, so it verifies what was shared', async () => {
		const { storedEvents, secrets } = await runAndExport();
		const leaky = await buildTraceFile(
			{ ...(await buildLeakyRun()), agentName: FAKE_KEY },
			storedEvents.map((row) => row.event),
			{ secrets }
		);
		const clean = await buildTraceFile(
			{ ...(await buildLeakyRun()), agentName: '[key-redacted]' },
			storedEvents.map((row) => row.event),
			{ secrets }
		);
		// Same visible bytes ⇒ same digest; a recipient can verify what they hold.
		expect(leaky.traceDigest).toBe(clean.traceDigest);
	});
});

/** A run record shaped like the real one, for the redaction-backstop tests. */
async function buildLeakyRun(): Promise<RunRecord> {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		agentId: '11111111-1111-4111-8111-111111111111',
		agentName: 'Snackbot 3000',
		goalCardId: 'starter/say-hello',
		specSnapshot: toSpecV2(makeSpec()),
		packVersions: packVersions(),
		mode: 'step',
		outcome: 'SUCCESS',
		ticks: 4,
		usage: { inputTokens: 100, outputTokens: 20 },
		budgets: { maxTicks: 30, maxTokens: 100000, requestTimeoutMs: 60000 },
		providerId: 'mock',
		wireModel: 'mock-1',
		pinned: false,
		startedAt: '2026-08-12T10:00:00Z',
		finishedAt: '2026-08-12T10:00:05Z',
		schemaVersion: 2
	};
}
