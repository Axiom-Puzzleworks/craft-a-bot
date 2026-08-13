import {
	toSpecV2,
	type AgentRecord,
	type AgentSpec,
	type AgentSpecV2,
	type EngineEvent,
	type RunRecord
} from '@craftabot/core';

/** Shared fixtures for the storage tests. */

export function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** The v1 bot, kept so the migration tests have a genuine old row to read. */
export function makeSpecV1(overrides: Partial<AgentSpec> = {}): AgentSpec {
	return {
		id: uuid(1),
		name: 'Snackbot 3000',
		bricks: {
			llm: {
				cartridgeId: 'test/mock-brain',
				temperature: 0.7,
				maxTokens: 300,
				personality: 'You are a cheerful little robot.'
			},
			memory: { windowSize: 10, notebook: true },
			sense: { channels: ['sight', 'compass'] },
			actions: { enabled: ['move', 'say'] }
		},
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 1,
		...overrides
	};
}

export function makeSpec(overrides: Partial<AgentSpecV2> = {}): AgentSpecV2 {
	return {
		...toSpecV2(makeSpecV1()),
		identity: { displayName: 'Snackbot 3000', boxArtSeed: 'seed-1' },
		...overrides
	};
}

export function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
	const spec = overrides.spec ?? makeSpec();
	return {
		id: spec.id,
		spec,
		lastValidation: [],
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 2,
		...overrides
	};
}

/** A row exactly as V1.0 wrote it, for the "nobody loses a bot" tests. */
export function makeAgentV1(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	const spec = makeSpecV1();
	return {
		id: spec.id,
		spec,
		boxArtSeed: 'seed-1',
		lastValidation: [],
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:30:00Z',
		schemaVersion: 1,
		...overrides
	};
}

export function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
	return {
		id: uuid(100),
		agentId: uuid(1),
		agentName: 'Snackbot 3000',
		goalCardId: 'starter/say-hello',
		specSnapshot: makeSpec(),
		packVersions: { starter: '0.2.0' },
		mode: 'step',
		outcome: 'SUCCESS',
		ticks: 4,
		usage: { inputTokens: 120, outputTokens: 40 },
		budgets: { maxTicks: 30, maxTokens: 100000, requestTimeoutMs: 60000 },
		providerId: 'mock',
		wireModel: 'mock-1',
		pinned: false,
		startedAt: '2026-08-12T10:00:00Z',
		finishedAt: '2026-08-12T10:00:05Z',
		schemaVersion: 2,
		...overrides
	};
}

export function makeEvent(runId: string, tick: number, id: number): EngineEvent {
	return {
		id: uuid(id),
		runId,
		tick,
		timestamp: '2026-08-12T10:00:00Z',
		type: 'tick.started',
		payload: {}
	};
}
