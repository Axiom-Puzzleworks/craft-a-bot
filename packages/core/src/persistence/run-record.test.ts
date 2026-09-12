import { describe, expect, it } from 'vitest';
import type { AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import type { EngineEvent } from '../schemas/events.js';
import { DEFAULT_TICK_BUDGET, DEFAULT_TOKEN_BUDGET } from '../session/budgets.js';
import { runRecordFrom } from './run-record.js';

/**
 * `runRecordFrom` (WP84, moved from the harness): the record is read out of
 * the trace — mode, budgets, provider and wire model from `run.started`,
 * ticks and usage folded from the events — and says `unrecorded` and the
 * defaults when the trace has no `run.started` at all.
 */
const SPEC: AgentSpecV2 = {
	id: '11111111-1111-4111-8111-111111111111',
	name: 'Recorder',
	goalCardId: 'card-x',
	bricks: [],
	identity: { displayName: 'Recorder', boxArtSeed: 'seed-1' },
	createdAt: '2026-09-11T09:00:00Z',
	updatedAt: '2026-09-11T09:00:00Z',
	schemaVersion: 2
};

const base = (tick: number, type: string, payload: unknown): EngineEvent =>
	({
		id: `e-${tick}-${type}`,
		runId: 'run-1',
		tick,
		timestamp: '2026-09-11T09:00:01.000Z',
		type,
		payload
	}) as unknown as EngineEvent;

describe('runRecordFrom', () => {
	it('reads mode, budgets, provider and model from run.started and folds ticks and usage from the events', () => {
		const events: EngineEvent[] = [
			base(0, 'run.started', {
				mode: 'run',
				budgets: { maxTicks: 5, maxTokens: 500, requestTimeoutMs: 1_000 },
				providerId: 'mock',
				wireModel: 'mock-1'
			}),
			base(1, 'think.completed', { response: { usage: { inputTokens: 10, outputTokens: 4 } } }),
			base(2, 'think.completed', { response: { usage: { inputTokens: 6, outputTokens: 1 } } })
		];
		const record = runRecordFrom({
			runId: 'run-1',
			spec: SPEC,
			events,
			packVersions: { starter: '1.0.0' },
			startedAt: '2026-09-11T09:00:00.000Z',
			finishedAt: '2026-09-11T09:00:05.000Z',
			outcome: 'SUCCESS',
			pinned: true
		});
		expect(record).toMatchObject({
			id: 'run-1',
			agentId: SPEC.id,
			agentName: 'Recorder',
			goalCardId: 'card-x',
			mode: 'run',
			outcome: 'SUCCESS',
			ticks: 2,
			usage: { inputTokens: 16, outputTokens: 5 },
			budgets: { maxTicks: 5, maxTokens: 500, requestTimeoutMs: 1_000 },
			providerId: 'mock',
			wireModel: 'mock-1',
			pinned: true,
			startedAt: '2026-09-11T09:00:00.000Z',
			finishedAt: '2026-09-11T09:00:05.000Z',
			schemaVersion: 2
		});
		expect(record.specSnapshot).toBe(SPEC);
	});

	it('says unrecorded and takes the defaults when the trace has no run.started, and leaves finishedAt off', () => {
		const record = runRecordFrom({
			runId: 'run-2',
			spec: SPEC,
			events: [],
			packVersions: {},
			startedAt: '2026-09-11T09:00:00.000Z'
		});
		expect(record).toMatchObject({
			mode: 'step',
			outcome: 'IN_PROGRESS',
			ticks: 0,
			usage: { inputTokens: 0, outputTokens: 0 },
			budgets: { maxTicks: DEFAULT_TICK_BUDGET, maxTokens: DEFAULT_TOKEN_BUDGET },
			providerId: 'unrecorded',
			wireModel: 'unrecorded',
			pinned: false
		});
		expect('finishedAt' in record).toBe(false);
	});
});
