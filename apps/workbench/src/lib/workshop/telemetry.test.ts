import { describe, expect, it } from 'vitest';
import type { EngineEvent, RunRecord } from '@craftabot/core';
import {
	autonomyTelemetry,
	guardrailMix,
	telemetryByCard,
	telemetryByCartridge
} from './telemetry.js';

/**
 * The dashboard's arithmetic, broken down instead of totalled — `fleet.
 * test.ts`'s own reason applies here too: every one of these has an edge
 * case that is invisible once it is a row on a screen.
 */

let seq = 0;
const run = (over: Partial<RunRecord> = {}): RunRecord =>
	({
		id: `run-${++seq}`,
		agentId: 'agent-1',
		agentName: 'Bolt',
		goalCardId: 'starter/snack',
		outcome: 'SUCCESS',
		ticks: 7,
		usage: { inputTokens: 100, outputTokens: 50 },
		providerId: 'demo',
		wireModel: 'demo-brain',
		startedAt: '2026-08-15T10:00:00.000Z',
		...over
	}) as never as RunRecord;

function event<T extends EngineEvent['type']>(type: T, payload: unknown, tick = 1): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-08-15T09:00:00.000Z',
		type,
		payload
	} as EngineEvent;
}

describe('telemetryByCard', () => {
	it('has no rate at all for a card nothing has finished on', () => {
		const rows = telemetryByCard([run({ goalCardId: 'a', outcome: 'IN_PROGRESS' })]);
		expect(rows[0]).toMatchObject({ successRate: undefined, loopRate: undefined });
	});

	it('splits success and looping apart — a run can only be one', () => {
		const rows = telemetryByCard([
			run({ goalCardId: 'a', outcome: 'SUCCESS' }),
			run({ goalCardId: 'a', outcome: 'OUT_OF_STEPS' }),
			run({ goalCardId: 'a', outcome: 'OUT_OF_STEPS' })
		]);
		expect(rows[0]?.successRate).toBeCloseTo(1 / 3);
		expect(rows[0]?.loopRate).toBeCloseTo(2 / 3);
	});

	it('keeps each card separate', () => {
		const rows = telemetryByCard([
			run({ goalCardId: 'a', outcome: 'SUCCESS' }),
			run({ goalCardId: 'b', outcome: 'ERROR' })
		]);
		expect(rows.find((r) => r.goalCardId === 'a')?.successRate).toBe(1);
		expect(rows.find((r) => r.goalCardId === 'b')?.successRate).toBe(0);
	});

	it('means ticks and tokens only over what finished', () => {
		const rows = telemetryByCard([
			run({
				goalCardId: 'a',
				outcome: 'SUCCESS',
				ticks: 4,
				usage: { inputTokens: 10, outputTokens: 10 }
			}),
			run({
				goalCardId: 'a',
				outcome: 'SUCCESS',
				ticks: 8,
				usage: { inputTokens: 30, outputTokens: 30 }
			}),
			run({
				goalCardId: 'a',
				outcome: 'IN_PROGRESS',
				ticks: 99,
				usage: { inputTokens: 999, outputTokens: 999 }
			})
		]);
		expect(rows[0]?.meanTicks).toBe(6);
		expect(rows[0]?.meanTokens).toBe(40);
		expect(rows[0]?.runs).toBe(3);
		expect(rows[0]?.finishedRuns).toBe(2);
	});

	it('busiest card first', () => {
		const rows = telemetryByCard([
			run({ goalCardId: 'quiet' }),
			run({ goalCardId: 'busy' }),
			run({ goalCardId: 'busy' })
		]);
		expect(rows.map((r) => r.goalCardId)).toEqual(['busy', 'quiet']);
	});
});

describe('telemetryByCartridge', () => {
	it('groups by provider and the model that actually answered, not merely the cartridge', () => {
		const rows = telemetryByCartridge([
			run({ providerId: 'openai', wireModel: 'gpt-4o-mini', outcome: 'SUCCESS' }),
			run({ providerId: 'openai', wireModel: 'gpt-4o', outcome: 'SUCCESS' }),
			run({ providerId: 'openai', wireModel: 'gpt-4o', outcome: 'ERROR' })
		]);
		expect(rows).toHaveLength(2);
		const gpt4o = rows.find((r) => r.wireModel === 'gpt-4o');
		expect(gpt4o?.runs).toBe(2);
		expect(gpt4o?.successRate).toBe(0.5);
	});
});

describe('guardrailMix', () => {
	it('counts trips by guardrail id, across every run in scope', () => {
		const mix = guardrailMix(
			new Map([
				[
					'r1',
					[event('guardrail.tripped', { guardrailId: 'starter/action-blocklist', reason: 'no' })]
				],
				[
					'r2',
					[
						event('guardrail.tripped', { guardrailId: 'starter/action-blocklist', reason: 'no' }),
						event('guardrail.tripped', { guardrailId: 'starter/step-budget', reason: 'no' })
					]
				]
			])
		);
		expect(mix).toEqual([
			{ guardrailId: 'starter/action-blocklist', trips: 2 },
			{ guardrailId: 'starter/step-budget', trips: 1 }
		]);
	});

	it('ignores every other event type', () => {
		const mix = guardrailMix(new Map([['r1', [event('action.performed', {})]]]));
		expect(mix).toEqual([]);
	});
});

describe('autonomyTelemetry', () => {
	it('has no approval rate at all when nothing has ever asked', () => {
		const stats = autonomyTelemetry([run()], new Map([['r1', []]]));
		expect(stats.approvalRate).toBeUndefined();
	});

	it('rates approvals granted over approvals requested', () => {
		const stats = autonomyTelemetry(
			[run({ id: 'r1' })],
			new Map([
				[
					'r1',
					[
						event('approval.resolved', { approved: true }),
						event('approval.resolved', { approved: true }),
						event('approval.resolved', { approved: false })
					]
				]
			])
		);
		expect(stats.approvalsRequested).toBe(3);
		expect(stats.approvalsGranted).toBe(2);
		expect(stats.approvalRate).toBeCloseTo(2 / 3);
	});

	it('counts a run a person stopped as an interruption', () => {
		const stats = autonomyTelemetry(
			[run({ outcome: 'STOPPED_BY_USER' }), run({ outcome: 'SUCCESS' })],
			new Map()
		);
		expect(stats.interruptions).toBe(1);
	});
});
