import { describe, expect, it } from 'vitest';
import { buildTraceFile, verifyTraceDigest } from './trace-export.js';
import { REDACTED } from './redact.js';
import type { EngineEvent } from '../schemas/events.js';
import type { RunRecord } from '../schemas/trace-file.js';
import { makeEvaluation } from '../testing/storage-fixtures.js';

function makeRun(overrides: Partial<RunRecord> = {}): RunRecord {
	return {
		id: '22222222-2222-4222-8222-222222222222',
		agentId: '11111111-1111-4111-8111-111111111111',
		agentName: 'Snackbot 3000',
		goalCardId: 'starter/say-hello',
		specSnapshot: {
			id: '11111111-1111-4111-8111-111111111111',
			name: 'Snackbot 3000',
			bricks: {},
			goalCardId: 'starter/say-hello',
			createdAt: '2026-08-12T09:00:00Z',
			updatedAt: '2026-08-12T09:00:00Z',
			schemaVersion: 1
		},
		packVersions: { starter: '0.2.0' },
		mode: 'step',
		outcome: 'SUCCESS',
		ticks: 2,
		usage: { inputTokens: 100, outputTokens: 20 },
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

const events: EngineEvent[] = [
	{
		id: '33333333-3333-4333-8333-333333333333',
		runId: '22222222-2222-4222-8222-222222222222',
		tick: 0,
		timestamp: '2026-08-12T10:00:00Z',
		type: 'run.started',
		payload: {
			mode: 'step',
			budgets: { maxTicks: 30, maxTokens: 100_000, requestTimeoutMs: 60_000 },
			providerId: 'mock',
			wireModel: 'mock-1',
			cartridgeId: 'test/mock-brain'
		}
	},
	{
		id: '44444444-4444-4444-8444-444444444444',
		runId: '22222222-2222-4222-8222-222222222222',
		tick: 2,
		timestamp: '2026-08-12T10:00:05Z',
		type: 'run.finished',
		payload: { outcome: 'SUCCESS', ticks: 2, usage: { inputTokens: 100, outputTokens: 20 } }
	}
];

describe('buildTraceFile', () => {
	/** WP43 (`31-…` §4.4): a run's evaluations ride in the file, redacted like everything else, outside the digest. */
	it('carries evaluations when handed them, redacted, and leaves the digest to the events', async () => {
		const run = makeRun();
		const evaluation = makeEvaluation({
			runId: run.id,
			result: {
				evaluatorId: 'test/always-pass',
				verdict: 'pass',
				// Whole-string, as the scrubber matches (`redact.ts`): the secret *is* the explanation.
				explanation: 'sk-secret-1',
				evidence: []
			}
		});
		const bare = await buildTraceFile(run, [], { secrets: ['sk-secret-1'] });
		expect('evaluations' in bare).toBe(false);
		const full = await buildTraceFile(run, [], {
			secrets: ['sk-secret-1'],
			evaluations: [evaluation]
		});
		expect(full.evaluations).toHaveLength(1);
		expect(full.evaluations?.[0]?.result.explanation).toBe(REDACTED);
		expect(JSON.stringify(full)).not.toContain('sk-secret-1');
		expect(full.traceDigest).toBe(bare.traceDigest);
	});

	it('produces a self-contained record: spec snapshot, pack versions, every event', async () => {
		const trace = await buildTraceFile(makeRun(), events);

		expect(trace.format).toBe('craftabot-trace');
		expect(trace.run.specSnapshot).toBeDefined();
		expect(trace.run.packVersions).toEqual({ starter: '0.2.0' });
		expect(trace.events).toHaveLength(2);
	});

	it('stamps a digest that verifies', async () => {
		const trace = await buildTraceFile(makeRun(), events);
		expect(trace.traceDigest).toMatch(/^[0-9a-f]{64}$/);
		await expect(verifyTraceDigest(trace)).resolves.toBe(true);
	});

	it('fails verification once an event has been altered — tamper-evidence (08 §4)', async () => {
		const trace = await buildTraceFile(makeRun(), events);
		const tampered = {
			...trace,
			events: [...trace.events].reverse()
		};
		await expect(verifyTraceDigest(tampered)).resolves.toBe(false);
	});

	it('is deterministic: the same run always digests the same', async () => {
		const first = await buildTraceFile(makeRun(), events);
		const second = await buildTraceFile(makeRun(), events);
		expect(first.traceDigest).toBe(second.traceDigest);
	});

	it('scrubs secrets before digesting, so the digest covers what was shared', async () => {
		const trace = await buildTraceFile(makeRun({ agentName: 'sk-leaked' }), events, {
			secrets: ['sk-leaked']
		});
		expect(trace.run.agentName).toBe(REDACTED);
		await expect(verifyTraceDigest(trace)).resolves.toBe(true);
	});
});
