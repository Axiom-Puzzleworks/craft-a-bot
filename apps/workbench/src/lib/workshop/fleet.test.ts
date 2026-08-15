import { describe, expect, it } from 'vitest';
import type { AgentRecord, RunRecord } from '@craftabot/core';
import { fleetRows, telemetryFrom } from './fleet.js';

/**
 * The dashboard's arithmetic.
 *
 * Every one of these has an edge case that is invisible once it is a number on
 * a tile — which is the whole reason it is a pure function with tests rather
 * than an expression in a template.
 */

let seq = 0;
const agent = (name: string, slots: string[], id?: string): AgentRecord =>
	({
		id: id ?? `agent-${++seq}`,
		spec: { name, bricks: slots.map((slot) => ({ slot })) }
	}) as never as AgentRecord;

const run = (over: Partial<RunRecord> = {}): RunRecord =>
	({
		id: `run-${++seq}`,
		agentId: 'agent-1',
		agentName: 'Bolt',
		goalCardId: 'starter/snack',
		outcome: 'SUCCESS',
		ticks: 7,
		startedAt: '2026-08-15T10:00:00.000Z',
		...over
	}) as never as RunRecord;

describe('the fleet table', () => {
	it('shows the colour strip in build order, not spec order', () => {
		const rows = fleetRows([agent('Bolt', ['safety', 'brain'], 'a')], []);
		expect(rows[0]?.slots).toEqual(['brain', 'safety']);
	});

	it('shows a bot that has never run, rather than hiding it', () => {
		// Often the interesting one.
		const rows = fleetRows([agent('Nut', ['brain'], 'a')], []);
		expect(rows[0]).toMatchObject({ runs: 0, lastOutcome: undefined, lastRunAt: undefined });
	});

	it('takes "last run" from the newest, whatever order the store returned', () => {
		const rows = fleetRows(
			[agent('Bolt', ['brain'], 'a')],
			[
				run({ agentId: 'a', startedAt: '2026-08-01T09:00:00.000Z', outcome: 'OUT_OF_STEPS' }),
				run({ agentId: 'a', startedAt: '2026-08-15T09:00:00.000Z', outcome: 'SUCCESS' })
			]
		);
		expect(rows[0]).toMatchObject({ runs: 2, lastOutcome: 'SUCCESS' });
	});

	it('counts only its own runs', () => {
		const rows = fleetRows(
			[agent('Bolt', [], 'a'), agent('Nut', [], 'b')],
			[run({ agentId: 'a' }), run({ agentId: 'a' }), run({ agentId: 'b' })]
		);
		expect(rows.find((r) => r.name === 'Bolt')?.runs).toBe(2);
		expect(rows.find((r) => r.name === 'Nut')?.runs).toBe(1);
	});

	it('puts recently-run bots first and never-run bots last', () => {
		const rows = fleetRows(
			[agent('Never', [], 'a'), agent('Recent', [], 'b'), agent('Older', [], 'c')],
			[
				run({ agentId: 'b', startedAt: '2026-08-15T09:00:00.000Z' }),
				run({ agentId: 'c', startedAt: '2026-08-01T09:00:00.000Z' })
			]
		);
		expect(rows.map((r) => r.name)).toEqual(['Recent', 'Older', 'Never']);
	});
});

describe('telemetry', () => {
	const now = new Date('2026-08-15T12:00:00.000Z');
	const tele = (runs: RunRecord[], savesByRun: Record<string, number> = {}) =>
		telemetryFrom({ runs, savesByRun, now });

	it('has no success rate at all when nothing has finished', () => {
		// Not zero. "No runs yet" and "every run failed" must not look the same.
		expect(tele([]).successRate).toBeUndefined();
		expect(tele([run({ outcome: 'IN_PROGRESS' })]).successRate).toBeUndefined();
	});

	it('does not count a run still in progress as a failure', () => {
		// Otherwise the number drops every time somebody presses STEP.
		const stats = tele([run({ outcome: 'SUCCESS' }), run({ outcome: 'IN_PROGRESS' })]);
		expect(stats.successRate).toBe(1);
	});

	it('averages turns over the runs that succeeded', () => {
		const stats = tele([
			run({ outcome: 'SUCCESS', ticks: 4 }),
			run({ outcome: 'SUCCESS', ticks: 8 }),
			run({ outcome: 'OUT_OF_STEPS', ticks: 30 })
		]);
		// The 30 belongs to a run that never got there and would double the mean.
		expect(stats.meanTicksToSuccess).toBe(6);
		expect(stats.successRate).toBeCloseTo(2 / 3);
	});

	it('says nothing about ticks-to-success when nothing has succeeded', () => {
		expect(tele([run({ outcome: 'ERROR' })]).meanTicksToSuccess).toBeUndefined();
	});

	it('counts this week from a clock a test can hold still', () => {
		const stats = tele([
			run({ startedAt: '2026-08-14T09:00:00.000Z' }),
			run({ startedAt: '2026-08-01T09:00:00.000Z' })
		]);
		expect(stats.runsThisWeek).toBe(1);
	});

	it('totals guardrail saves across the runs in scope', () => {
		// The record does not carry them — they come from the events.
		const a = run({ id: 'r1' });
		const b = run({ id: 'r2' });
		expect(tele([a, b], { r1: 2, r2: 1 }).guardrailSaves).toBe(3);
	});

	it('reports the denominator the rate actually used', () => {
		/*
		 * Found on the screen rather than here: the tile showed "0% of 6 runs"
		 * while the rate had been computed from the one run that had finished.
		 * A success rate over three runs and one over three hundred are different
		 * claims, and quoting the larger number makes the weaker one look strong.
		 */
		const stats = tele([
			run({ outcome: 'SUCCESS' }),
			run({ outcome: 'IN_PROGRESS' }),
			run({ outcome: 'IN_PROGRESS' })
		]);
		expect(stats.runs).toBe(3);
		expect(stats.finishedRuns).toBe(1);
		expect(stats.successRate).toBe(1);
	});
});
