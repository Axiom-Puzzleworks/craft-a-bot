import { describe, expect, it } from 'vitest';
import type { RunOutcome, RunRecord, RunSummary } from '@craftabot/core';
import { DRIFT_DEFAULTS, dayOf, driftIn, mixDistance, telemetrySeries } from './drift.js';

/**
 * The two-week corpus the roadmap's DoD names (`27-…` WP49): ten quiet days
 * where the action blocklist does the catching and almost nothing loops,
 * then four days where the mix flips to the step budget and most runs loop.
 * Day 11 is the planted drift; the same fold over the quiet half alone must
 * flag nothing.
 */

let seq = 0;
const START = Date.UTC(2026, 7, 17); // 2026-08-17, a Monday
const DAY_MS = 24 * 60 * 60 * 1000;

function run(dayIndex: number, outcome: RunOutcome | 'IN_PROGRESS', hour = 10): RunRecord {
	return {
		id: `run-${++seq}`,
		agentId: 'agent-1',
		agentName: 'Bolt',
		goalCardId: 'starter/snack',
		outcome,
		ticks: 7,
		usage: { inputTokens: 100, outputTokens: 50 },
		providerId: 'demo',
		wireModel: 'demo-brain',
		startedAt: new Date(START + dayIndex * DAY_MS + hour * 60 * 60 * 1000).toISOString()
	} as never as RunRecord;
}

function summary(runId: string, trips: Record<string, number>): RunSummary {
	return {
		runId,
		checks: 3,
		saves: Object.values(trips).reduce((a, b) => a + b, 0),
		guardrailTrips: trips,
		approvalsRequested: 0,
		approvalsGranted: 0,
		findings: [],
		decisions: 3,
		hostedPreActScreens: 0,
		schemaVersion: 1
	};
}

/** Four runs a day: quiet days trip the blocklist and finish; drifted days trip the step budget and loop. */
function corpus(days: number, driftFrom: number | undefined) {
	const runs: RunRecord[] = [];
	const summaries = new Map<string, RunSummary>();
	for (let day = 0; day < days; day += 1) {
		const drifted = driftFrom !== undefined && day >= driftFrom;
		for (let n = 0; n < 4; n += 1) {
			const looped = drifted ? n < 3 : n === 0;
			const record = run(day, looped ? 'OUT_OF_STEPS' : 'SUCCESS', 9 + n);
			runs.push(record);
			summaries.set(
				record.id,
				summary(
					record.id,
					drifted
						? { 'safety/step-budget': 2, 'safety/action-blocklist': n === 3 ? 1 : 0 }
						: { 'safety/action-blocklist': 2, 'safety/step-budget': n === 3 ? 1 : 0 }
				)
			);
		}
	}
	return { runs, summaries };
}

describe('telemetrySeries', () => {
	it('is empty over no runs', () => {
		expect(telemetrySeries([], new Map())).toEqual([]);
	});

	it('buckets runs by the UTC day they started, contiguous from first to last, with rates only where something finished', () => {
		const a = run(0, 'SUCCESS');
		const b = run(0, 'OUT_OF_STEPS');
		const c = run(2, 'IN_PROGRESS');
		const summaries = new Map([
			[a.id, summary(a.id, { 'safety/action-blocklist': 1 })],
			[b.id, summary(b.id, { 'safety/step-budget': 1, 'safety/action-blocklist': 1 })]
		]);
		const series = telemetrySeries([c, a, b], summaries);
		expect(series.map((bucket) => bucket.day)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
		expect(series[0]).toMatchObject({
			runs: 2,
			finishedRuns: 2,
			succeededRuns: 1,
			loopedRuns: 1,
			successRate: 0.5,
			loopRate: 0.5,
			trips: { 'safety/action-blocklist': 2, 'safety/step-budget': 1 },
			tripsPerRun: 1.5
		});
		// The empty middle day is a bucket, not a gap in the axis.
		expect(series[1]).toMatchObject({ runs: 0, successRate: undefined, tripsPerRun: undefined });
		// A run still going counts as a run, never as a finished one; with no summary it has no trips to count.
		expect(series[2]).toMatchObject({
			runs: 1,
			finishedRuns: 0,
			successRate: undefined,
			tripsPerRun: undefined
		});
	});

	it('keys a day by UTC, so a run just before midnight in London is still that day', () => {
		expect(dayOf('2026-08-17T23:30:00.000Z')).toBe('2026-08-17');
		expect(dayOf('2026-08-18T00:00:00.000Z')).toBe('2026-08-18');
	});
});

describe('mixDistance', () => {
	it('is 0 for the same mix or no trips at all, 1 for disjoint mixes, ½ Σ|p − q| between', () => {
		expect(mixDistance({}, {})).toBe(0);
		expect(mixDistance({ a: 3 }, { a: 9 })).toBe(0);
		expect(mixDistance({ a: 3 }, { b: 1 })).toBe(1);
		expect(mixDistance({ a: 1 }, {})).toBe(1);
		expect(mixDistance({ a: 9, b: 1 }, { a: 1, b: 9 })).toBeCloseTo(0.8);
	});
});

describe('driftIn', () => {
	it('flags the planted day of a two-week corpus for both its trip mix and its loop rate, and nothing before it', () => {
		const { runs, summaries } = corpus(14, 10);
		const series = telemetrySeries(runs, summaries);
		expect(series).toHaveLength(14);
		const flags = driftIn(series);
		// Day 11 is the flip. Day 12 is still held against a baseline that is
		// two-thirds the old normal, so both flags fire once more, just over
		// their thresholds (0.52 and 0.33); by day 13 the baseline has caught up
		// and nothing is flagged again.
		expect(flags.map((flag) => [flag.day, flag.kind])).toEqual([
			['2026-08-27', 'trip-mix'],
			['2026-08-27', 'loop-rate'],
			['2026-08-28', 'trip-mix'],
			['2026-08-28', 'loop-rate']
		]);
		const mix = flags[0]!;
		expect(mix.magnitude).toBeGreaterThanOrEqual(DRIFT_DEFAULTS.mixThreshold);
		expect(mix.detail).toContain('safety/action-blocklist 89% → 11%');
		expect(mix.detail).toContain('safety/step-budget 11% → 89%');
		expect(flags[1]!.detail).toBe('looped 25% → 75% of finished runs');
	});

	it('flags nothing over a quiet corpus', () => {
		const { runs, summaries } = corpus(14, undefined);
		expect(driftIn(telemetrySeries(runs, summaries))).toEqual([]);
	});

	it('skips days, and baselines, with too few finished runs — a flag over a handful of runs is noise', () => {
		const { runs, summaries } = corpus(2, 1);
		// Four runs a day clears the default bar, so the flip on day two speaks…
		expect(driftIn(telemetrySeries(runs, summaries))).toHaveLength(2);
		// …and raising the bar past a day's worth silences it: neither the day nor its baseline qualifies.
		expect(driftIn(telemetrySeries(runs, summaries), { minRuns: 5 })).toEqual([]);
	});

	it('pools the window over non-empty days, skipping gaps', () => {
		const { runs, summaries } = corpus(3, undefined);
		const later = corpus(1, 0);
		// The drifted day is five days after the quiet three; the gap is buckets with no runs.
		for (const record of later.runs) {
			(record as { startedAt: string }).startedAt = new Date(
				Date.parse(record.startedAt) + 7 * DAY_MS
			).toISOString();
			runs.push(record);
			summaries.set(record.id, later.summaries.get(record.id)!);
		}
		const series = telemetrySeries(runs, summaries);
		expect(series).toHaveLength(8);
		expect(driftIn(series).map((flag) => flag.day)).toEqual(['2026-08-24', '2026-08-24']);
	});

	it('honours its thresholds', () => {
		const { runs, summaries } = corpus(14, 10);
		const series = telemetrySeries(runs, summaries);
		expect(driftIn(series, { mixThreshold: 1.01, loopThreshold: 1.01 })).toEqual([]);
	});
});
