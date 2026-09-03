import { describe, expect, it } from 'vitest';
import type { EngineEvent, RunRecord } from '@craftabot/core';
import { incidentsFrom } from './incidents.js';

let seq = 0;
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

const run = (over: Partial<RunRecord> = {}): RunRecord =>
	({
		id: `run-${++seq}`,
		agentId: 'agent-1',
		agentName: 'Bolt',
		goalCardId: 'starter/snack',
		outcome: 'SUCCESS',
		startedAt: '2026-08-15T10:00:00.000Z',
		...over
	}) as never as RunRecord;

describe('incidentsFrom', () => {
	it('is empty over a run whose trace never went wrong', () => {
		const clean = run({ id: 'r1' });
		const incidents = incidentsFrom(
			[clean],
			new Map([
				['r1', [event('action.performed', { name: 'move', result: { ok: true, narration: 'ok' } })]]
			])
		);
		expect(incidents).toEqual([]);
	});

	it("tags a guardrail catch, quoting the guardrail's own reason", () => {
		const trouble = run({ id: 'r1' });
		const incidents = incidentsFrom(
			[trouble],
			new Map([
				[
					'r1',
					[
						event('guardrail.tripped', {
							guardrailId: 'safety/action-blocklist',
							reason: 'blocked move'
						})
					]
				]
			])
		);
		expect(incidents[0]?.findings).toEqual([
			{ kind: 'guardrail-catch', tick: 1, summary: 'blocked move' }
		]);
	});

	it("tags a failed action, quoting the world's own narration", () => {
		const trouble = run({ id: 'r1' });
		const incidents = incidentsFrom(
			[trouble],
			new Map([
				[
					'r1',
					[
						event('action.performed', {
							name: 'move',
							result: { ok: false, narration: 'You bump into the wall.' }
						})
					]
				]
			])
		);
		expect(incidents[0]?.findings).toEqual([
			{ kind: 'action-failure', tick: 1, summary: 'You bump into the wall.' }
		]);
	});

	it('pairs a denied approval with the request it answers, in the same tick', () => {
		const trouble = run({ id: 'r1' });
		const incidents = incidentsFrom(
			[trouble],
			new Map([
				[
					'r1',
					[
						event('approval.requested', { proposed: {}, reason: 'irreversible' }, 3),
						event('approval.resolved', { approved: false }, 3)
					]
				]
			])
		);
		expect(incidents[0]?.findings).toEqual([
			{ kind: 'approval-denied', tick: 3, summary: 'A person said no: irreversible' }
		]);
	});

	it('falls back to a plain denial when no matching request is found', () => {
		const trouble = run({ id: 'r1' });
		const incidents = incidentsFrom(
			[trouble],
			new Map([['r1', [event('approval.resolved', { approved: false }, 3)]]])
		);
		expect(incidents[0]?.findings[0]?.summary).toBe('A person said no.');
	});

	it('tags a run that never reached SUCCESS', () => {
		const trouble = run({ id: 'r1', outcome: 'OUT_OF_STEPS' });
		const incidents = incidentsFrom(
			[trouble],
			new Map([['r1', [event('run.finished', { outcome: 'OUT_OF_STEPS', ticks: 30, usage: {} })]]])
		);
		expect(incidents[0]?.findings).toEqual([
			{ kind: 'run-failure', tick: 1, summary: 'The run ended OUT_OF_STEPS.' }
		]);
	});

	it('tags a raw error, quoting its own message', () => {
		const trouble = run({ id: 'r1' });
		const incidents = incidentsFrom(
			[trouble],
			new Map([['r1', [event('error', { message: 'The provider timed out.' })]]])
		);
		expect(incidents[0]?.findings).toEqual([
			{ kind: 'error', tick: 1, summary: 'The provider timed out.' }
		]);
	});

	it('collects every finding in one run, not just the first', () => {
		const trouble = run({ id: 'r1' });
		const incidents = incidentsFrom(
			[trouble],
			new Map([
				[
					'r1',
					[
						event('guardrail.tripped', { guardrailId: 'g', reason: 'r1' }, 1),
						event('action.performed', { name: 'move', result: { ok: false, narration: 'r2' } }, 2)
					]
				]
			])
		);
		expect(incidents[0]?.findings).toHaveLength(2);
	});

	it('leaves out a run with no events at all', () => {
		const quiet = run({ id: 'r1' });
		expect(incidentsFrom([quiet], new Map())).toEqual([]);
	});

	it('sorts newest first, across different runs', () => {
		const older = run({ id: 'older', startedAt: '2026-08-01T09:00:00.000Z' });
		const newer = run({ id: 'newer', startedAt: '2026-08-15T09:00:00.000Z' });
		const trouble = () => [event('error', { message: 'trouble' })];
		const incidents = incidentsFrom(
			[older, newer],
			new Map([
				['older', trouble()],
				['newer', trouble()]
			])
		);
		expect(incidents.map((incident) => incident.runId)).toEqual(['newer', 'older']);
	});
});
