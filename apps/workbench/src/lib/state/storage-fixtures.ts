import type { AgentRecord, AgentSpec, EngineEvent, RunRecord } from '@craftabot/core';

/** Shared fixtures for the storage tests. */

export function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

export function makeSpec(overrides: Partial<AgentSpec> = {}): AgentSpec {
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

export function makeAgent(overrides: Partial<AgentRecord> = {}): AgentRecord {
	const spec = overrides.spec ?? makeSpec();
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
		pinned: false,
		startedAt: '2026-08-12T10:00:00Z',
		finishedAt: '2026-08-12T10:00:05Z',
		schemaVersion: 1,
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
