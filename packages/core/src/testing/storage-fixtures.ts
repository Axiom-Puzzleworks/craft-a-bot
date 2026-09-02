import type { AgentSpec } from '../schemas/agent-spec.js';
import { toSpecV2, type AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import type { EngineEvent } from '../schemas/events.js';
import type {
	AgentRecord,
	GroupRunRecord,
	RunSummary,
	EvaluationRecord,
	StoredCampaignReport
} from '../schemas/records.js';
import type { RunRecord } from '../schemas/trace-file.js';

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

export function makeGroupRun(overrides: Partial<GroupRunRecord> = {}): GroupRunRecord {
	return {
		id: uuid(200),
		goalCardId: 'starter/tidy-together',
		memberRunIds: [uuid(1), uuid(2)],
		memberAgentIds: [uuid(1), uuid(2)],
		outcome: 'SUCCESS',
		rounds: 12,
		usage: { inputTokens: 240, outputTokens: 80 },
		pinned: false,
		startedAt: '2026-08-19T10:00:00Z',
		finishedAt: '2026-08-19T10:00:12Z',
		schemaVersion: 1,
		...overrides
	};
}

/** A finished run's summary (WP36 stage C), keyed to `makeRun()`'s own id by default. */
export function makeRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
	return {
		runId: uuid(100),
		checks: 3,
		saves: 1,
		guardrailTrips: { 'safety/step-budget': 1 },
		approvalsRequested: 0,
		approvalsGranted: 0,
		findings: [{ kind: 'guardrail-catch', tick: 2, summary: 'Out of steps.' }],
		decisions: 3,
		hostedPreActScreens: 0,
		schemaVersion: 1,
		...overrides
	};
}

/** A stored campaign report (WP38 stage D) — the envelope, with a small opaque report inside. */
export function makeCampaignReport(
	overrides: Partial<StoredCampaignReport> = {}
): StoredCampaignReport {
	return {
		id: uuid(400),
		campaignId: 'injection-baseline',
		title: 'Injection baseline',
		createdAt: '2026-09-02T12:00:00Z',
		passed: true,
		gatesPassed: 13,
		gatesTotal: 13,
		cells: 320,
		report: { schemaVersion: 1, id: uuid(400), cells: [], gates: [] },
		schemaVersion: 1,
		...overrides
	};
}

/** A stored evaluation (WP43) — one evaluator's verdict over one run. */
export function makeEvaluation(overrides: Partial<EvaluationRecord> = {}): EvaluationRecord {
	return {
		id: uuid(500),
		runId: uuid(1),
		evaluatorId: 'test/always-pass',
		result: {
			evaluatorId: 'test/always-pass',
			verdict: 'pass',
			score: 1,
			explanation: 'Nothing to see.',
			evidence: [{ eventId: uuid(2), tick: 1 }]
		},
		evaluatedAt: '2026-09-02T12:00:00Z',
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
