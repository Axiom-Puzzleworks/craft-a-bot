import { isRunFinished } from '@craftabot/core';
import type { EvaluationRecord, RunRecord, RunSummary } from '@craftabot/core';

/**
 * **Telemetry over time, and drift** (`37-DRIFT-SAFETY-CASE-RUN-LAB.md`
 * §4.1, WP49; `19-…` #23's "behavioural drift dashboard", the half `18-…`
 * §7 item 28 recorded WP34 as not shipping). `telemetry.ts` answers "how is
 * the fleet doing at what"; this answers "is it changing" — the same rows
 * bucketed by the day a run started, and a bucket held against the buckets
 * before it.
 *
 * Pure, and it reads no clock: the series runs from the first stored run's
 * day to the last, so a test with a two-week fixture gets a two-week series
 * whatever today is. Every day between is a bucket, empty or not — a gap in
 * the fleet's history is a fact about the fleet, and a series that skipped
 * it would draw a step where there was a silence.
 *
 * **Drift is a comparison, not a model.** A day with enough finished runs is
 * held against the pooled days before it, and two things are compared: the
 * *trip mix* (which guardrails did the catching, as shares) by total-
 * variation distance, and the *loop rate* (`OUT_OF_STEPS` over finished —
 * the loop score the roadmap names) by plain difference. The thresholds are
 * options with stated defaults, so a screen can say what "drift" meant.
 * No cost figure here either, for `telemetry.ts`'s own reason.
 */

export interface TelemetryBucket {
	/** `YYYY-MM-DD`, UTC — the day the run started. */
	day: string;
	runs: number;
	finishedRuns: number;
	succeededRuns: number;
	/** Finished runs that ran out of steps — the closest thing to "looped" a run record can say. */
	loopedRuns: number;
	/** `undefined` when nothing finished that day — never 0, which would claim a rate. */
	successRate: number | undefined;
	loopRate: number | undefined;
	/** `guardrail.tripped` counts by guardrail id, from the runs' summaries. */
	trips: Record<string, number>;
	/** Total trips over the runs that have a summary; `undefined` when none has one. */
	tripsPerRun: number | undefined;
	/**
	 * Domain series (WP61, `50-DOMAIN-METRICS.md` §4.7), by name:
	 * `evaluator:<id>:passRate`, `evaluator:<id>:label:<label>` (a share),
	 * `case:<metric>` (a mean), `cohort:<attribute>:spread` (max − min success
	 * rate across the attribute's values) — from the day's evaluation records
	 * and campaign reports. Absent names had nothing that day.
	 */
	series: Record<string, number>;
	/** How many samples each series value rests on — a flag over two is noise. */
	seriesSamples: Record<string, number>;
}

/**
 * A campaign report as the drift detector reads it (WP61): structural, so
 * `governance` never imports `evals`. A cell's labels, case metrics and
 * cohort are optional — a v1 report has none.
 */
export interface DriftReportLike {
	createdAt: string;
	cells: ReadonlyArray<{
		outcome?: string | undefined;
		evaluations: Readonly<Record<string, 'pass' | 'fail' | 'inconclusive'>>;
		labels?: Readonly<Record<string, string>> | undefined;
		caseMetrics?: Readonly<Record<string, number>> | undefined;
		cohort?: Readonly<Record<string, string>> | undefined;
	}>;
}

/** What `telemetrySeries` reads beyond the runs (WP61): evaluation records and campaign reports. */
export interface TelemetryExtras {
	evaluations?: readonly EvaluationRecord[];
	reports?: readonly DriftReportLike[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC day a run started, as the bucket key. */
export function dayOf(iso: string): string {
	return new Date(iso).toISOString().slice(0, 10);
}

function emptyBucket(day: string): TelemetryBucket {
	return {
		day,
		runs: 0,
		finishedRuns: 0,
		succeededRuns: 0,
		loopedRuns: 0,
		successRate: undefined,
		loopRate: undefined,
		trips: {},
		tripsPerRun: undefined,
		series: {},
		seriesSamples: {}
	};
}

/** A day's tallies behind the domain series, folded to numbers when the bucket is closed. */
interface DomainTally {
	verdicts: Map<string, { pass: number; fail: number }>;
	labels: Map<string, Map<string, number>>;
	labelled: Map<string, number>;
	caseMetrics: Map<string, { sum: number; n: number }>;
	cohorts: Map<string, Map<string, { success: number; n: number }>>;
}

const emptyTally = (): DomainTally => ({
	verdicts: new Map(),
	labels: new Map(),
	labelled: new Map(),
	caseMetrics: new Map(),
	cohorts: new Map()
});

function tallyVerdict(tally: DomainTally, evaluatorId: string, verdict: string | undefined): void {
	if (verdict !== 'pass' && verdict !== 'fail') return;
	const counts = tally.verdicts.get(evaluatorId) ?? { pass: 0, fail: 0 };
	counts[verdict] += 1;
	tally.verdicts.set(evaluatorId, counts);
}

function tallyLabel(tally: DomainTally, evaluatorId: string, label: string | undefined): void {
	if (label === undefined) return;
	const counts = tally.labels.get(evaluatorId) ?? new Map<string, number>();
	counts.set(label, (counts.get(label) ?? 0) + 1);
	tally.labels.set(evaluatorId, counts);
	tally.labelled.set(evaluatorId, (tally.labelled.get(evaluatorId) ?? 0) + 1);
}

function foldTally(tally: DomainTally): Pick<TelemetryBucket, 'series' | 'seriesSamples'> {
	const series: Record<string, number> = {};
	const samples: Record<string, number> = {};
	for (const [id, { pass, fail }] of tally.verdicts) {
		series[`evaluator:${id}:passRate`] = pass / (pass + fail);
		samples[`evaluator:${id}:passRate`] = pass + fail;
	}
	for (const [id, labels] of tally.labels) {
		const total = tally.labelled.get(id) ?? 0;
		for (const [label, count] of labels) {
			series[`evaluator:${id}:label:${label}`] = count / total;
			samples[`evaluator:${id}:label:${label}`] = total;
		}
	}
	for (const [id, { sum, n }] of tally.caseMetrics) {
		series[`case:${id}`] = sum / n;
		samples[`case:${id}`] = n;
	}
	for (const [attribute, values] of tally.cohorts) {
		if (values.size < 2) continue;
		const rates = [...values.values()].map(({ success, n }) => success / n);
		series[`cohort:${attribute}:spread`] = Math.max(...rates) - Math.min(...rates);
		samples[`cohort:${attribute}:spread`] = [...values.values()].reduce((t, v) => t + v.n, 0);
	}
	return { series, seriesSamples: samples };
}

/**
 * One bucket per UTC day from the first run's day to the last, contiguous.
 * Empty when there are no runs at all.
 */
export function telemetrySeries(
	runs: readonly RunRecord[],
	summaries: ReadonlyMap<string, RunSummary>,
	extras: TelemetryExtras = {}
): TelemetryBucket[] {
	const evaluations = extras.evaluations ?? [];
	const reports = extras.reports ?? [];
	if (runs.length === 0 && evaluations.length === 0 && reports.length === 0) return [];
	const byDay = new Map<string, TelemetryBucket & { summarised: number; tripTotal: number }>();
	const tallies = new Map<string, DomainTally>();
	let first = Infinity;
	let last = -Infinity;
	const open = (day: string) => {
		const at = Date.parse(`${day}T00:00:00.000Z`);
		first = Math.min(first, at);
		last = Math.max(last, at);
		let bucket = byDay.get(day);
		if (!bucket) {
			bucket = { ...emptyBucket(day), summarised: 0, tripTotal: 0 };
			byDay.set(day, bucket);
		}
		return bucket;
	};
	const tallyFor = (day: string) => {
		open(day);
		let tally = tallies.get(day);
		if (!tally) {
			tally = emptyTally();
			tallies.set(day, tally);
		}
		return tally;
	};
	// The domain series (WP61): every record and every report cell, on the day it was made.
	for (const record of evaluations) {
		const tally = tallyFor(dayOf(record.evaluatedAt));
		tallyVerdict(tally, record.evaluatorId, record.result.verdict);
		tallyLabel(tally, record.evaluatorId, record.result.label);
	}
	for (const report of reports) {
		const tally = tallyFor(dayOf(report.createdAt));
		for (const cell of report.cells) {
			for (const [id, verdict] of Object.entries(cell.evaluations))
				tallyVerdict(tally, id, verdict);
			for (const [id, label] of Object.entries(cell.labels ?? {})) tallyLabel(tally, id, label);
			for (const [id, value] of Object.entries(cell.caseMetrics ?? {})) {
				const stat = tally.caseMetrics.get(id) ?? { sum: 0, n: 0 };
				stat.sum += value;
				stat.n += 1;
				tally.caseMetrics.set(id, stat);
			}
			for (const [attribute, value] of Object.entries(cell.cohort ?? {})) {
				const values =
					tally.cohorts.get(attribute) ?? new Map<string, { success: number; n: number }>();
				const count = values.get(value) ?? { success: 0, n: 0 };
				count.n += 1;
				if (cell.outcome === 'SUCCESS') count.success += 1;
				values.set(value, count);
				tally.cohorts.set(attribute, values);
			}
		}
	}
	for (const run of runs) {
		const day = dayOf(run.startedAt);
		const bucket = open(day);
		bucket.runs += 1;
		if (isRunFinished(run)) {
			bucket.finishedRuns += 1;
			if (run.outcome === 'SUCCESS') bucket.succeededRuns += 1;
			if (run.outcome === 'OUT_OF_STEPS') bucket.loopedRuns += 1;
		}
		const summary = summaries.get(run.id);
		if (summary) {
			bucket.summarised += 1;
			for (const [guardrailId, trips] of Object.entries(summary.guardrailTrips)) {
				bucket.trips[guardrailId] = (bucket.trips[guardrailId] ?? 0) + trips;
				bucket.tripTotal += trips;
			}
		}
	}

	const series: TelemetryBucket[] = [];
	for (let at = first; at <= last; at += DAY_MS) {
		const day = new Date(at).toISOString().slice(0, 10);
		const bucket = byDay.get(day);
		if (!bucket) {
			series.push(emptyBucket(day));
			continue;
		}
		const { summarised, tripTotal, ...rest } = bucket;
		const tally = tallies.get(day);
		series.push({
			...rest,
			successRate: rest.finishedRuns === 0 ? undefined : rest.succeededRuns / rest.finishedRuns,
			loopRate: rest.finishedRuns === 0 ? undefined : rest.loopedRuns / rest.finishedRuns,
			tripsPerRun: summarised === 0 ? undefined : tripTotal / summarised,
			...(tally ? foldTally(tally) : { series: {}, seriesSamples: {} })
		});
	}
	return series;
}

/** `driftIn`'s knobs: the baseline window, the minimum runs, and the two thresholds. */
export interface DriftOptions {
	/** How many earlier non-empty days make the baseline. Default 3. */
	window?: number;
	/** Finished runs a day (and the pooled baseline) needs before it is compared. Default 3. */
	minRuns?: number;
	/** Total-variation distance between trip mixes at or above which a day is flagged. Default 0.5. */
	mixThreshold?: number;
	/** Absolute change in loop rate at or above which a day is flagged. Default 0.3. */
	loopThreshold?: number;
	/** Absolute change in a domain series (WP61) at or above which a day is flagged. Default 0.3, the loop rate's. */
	seriesThreshold?: number;
}

/** The thresholds `driftIn` uses unless told otherwise. */
export const DRIFT_DEFAULTS: Required<DriftOptions> = {
	window: 3,
	minRuns: 3,
	mixThreshold: 0.5,
	loopThreshold: 0.3,
	seriesThreshold: 0.3
};

/** A day whose trip mix or loop rate moved against the days before it. */
export interface DriftFlag {
	day: string;
	kind: 'trip-mix' | 'loop-rate' | 'series';
	/** The domain series that moved, for a `series` flag (WP61). */
	series?: string;
	/** The distance or difference that crossed the threshold, in [0, 1]. */
	magnitude: number;
	/** What was compared with what, in the guardrails' and outcomes' own names. */
	detail: string;
}

interface Pool {
	finishedRuns: number;
	loopedRuns: number;
	trips: Record<string, number>;
}

function poolOf(buckets: readonly TelemetryBucket[]): Pool {
	const pool: Pool = { finishedRuns: 0, loopedRuns: 0, trips: {} };
	for (const bucket of buckets) {
		pool.finishedRuns += bucket.finishedRuns;
		pool.loopedRuns += bucket.loopedRuns;
		for (const [id, trips] of Object.entries(bucket.trips)) {
			pool.trips[id] = (pool.trips[id] ?? 0) + trips;
		}
	}
	return pool;
}

function sharesOf(trips: Record<string, number>): Map<string, number> {
	const total = Object.values(trips).reduce((sum, count) => sum + count, 0);
	const shares = new Map<string, number>();
	if (total === 0) return shares;
	for (const [id, count] of Object.entries(trips)) shares.set(id, count / total);
	return shares;
}

/** Total-variation distance between two trip mixes: ½ Σ |p − q| over the union of ids; 0 when neither has a trip. */
export function mixDistance(a: Record<string, number>, b: Record<string, number>): number {
	const p = sharesOf(a);
	const q = sharesOf(b);
	if (p.size === 0 && q.size === 0) return 0;
	// Trips against none is as far apart as two mixes get: nothing to share out on one side.
	if (p.size === 0 || q.size === 0) return 1;
	const ids = new Set([...p.keys(), ...q.keys()]);
	let sum = 0;
	for (const id of ids) sum += Math.abs((p.get(id) ?? 0) - (q.get(id) ?? 0));
	return sum / 2;
}

const pct = (share: number) => `${Math.round(share * 100)}%`;
const round = (value: number) => String(Math.round(value * 100) / 100);

function mixDetail(before: Record<string, number>, after: Record<string, number>): string {
	const p = sharesOf(before);
	const q = sharesOf(after);
	const ids = [...new Set([...p.keys(), ...q.keys()])].sort(
		(x, y) =>
			Math.abs((q.get(y) ?? 0) - (p.get(y) ?? 0)) - Math.abs((q.get(x) ?? 0) - (p.get(x) ?? 0)) ||
			x.localeCompare(y)
	);
	return ids
		.slice(0, 3)
		.map((id) => `${id} ${pct(p.get(id) ?? 0)} → ${pct(q.get(id) ?? 0)}`)
		.join('; ');
}

/**
 * Every day whose trip mix or loop rate moved, held against the pooled
 * `window` non-empty days before it. Days without `minRuns` finished runs,
 * and days whose baseline has fewer, are not compared — a flag over two runs
 * would be noise dressed as a finding.
 */
export function driftIn(
	series: readonly TelemetryBucket[],
	options: DriftOptions = {}
): DriftFlag[] {
	const { window, minRuns, mixThreshold, loopThreshold, seriesThreshold } = {
		...DRIFT_DEFAULTS,
		...options
	};
	const flags: DriftFlag[] = [];
	for (let index = 0; index < series.length; index += 1) {
		const bucket = series[index] as TelemetryBucket;
		// The domain series (WP61): each name the day carries, against the mean of the
		// earlier days that carry it — its own samples floor, since a campaign's cells are not runs.
		for (const [name, value] of Object.entries(bucket.series)) {
			if ((bucket.seriesSamples[name] ?? 0) < minRuns) continue;
			const earlier: number[] = [];
			let pooledSamples = 0;
			for (let back = index - 1; back >= 0 && earlier.length < window; back -= 1) {
				const candidate = series[back] as TelemetryBucket;
				if (candidate.series[name] === undefined) continue;
				earlier.push(candidate.series[name] as number);
				pooledSamples += candidate.seriesSamples[name] ?? 0;
			}
			if (earlier.length === 0 || pooledSamples < minRuns) continue;
			const baseline = earlier.reduce((total, v) => total + v, 0) / earlier.length;
			const change = Math.abs(value - baseline);
			if (change >= seriesThreshold) {
				flags.push({
					day: bucket.day,
					kind: 'series',
					series: name,
					magnitude: Math.min(1, change),
					detail: `${name} ${round(baseline)} → ${round(value)}`
				});
			}
		}
		if (bucket.finishedRuns < minRuns) continue;
		const earlier: TelemetryBucket[] = [];
		for (let back = index - 1; back >= 0 && earlier.length < window; back -= 1) {
			const candidate = series[back] as TelemetryBucket;
			if (candidate.runs > 0) earlier.push(candidate);
		}
		const baseline = poolOf(earlier);
		if (baseline.finishedRuns < minRuns) continue;

		const distance = mixDistance(baseline.trips, bucket.trips);
		if (distance >= mixThreshold) {
			flags.push({
				day: bucket.day,
				kind: 'trip-mix',
				magnitude: distance,
				detail: mixDetail(baseline.trips, bucket.trips)
			});
		}

		const baselineLoop = baseline.loopedRuns / baseline.finishedRuns;
		const loop = bucket.loopedRuns / bucket.finishedRuns;
		const change = Math.abs(loop - baselineLoop);
		if (change >= loopThreshold) {
			flags.push({
				day: bucket.day,
				kind: 'loop-rate',
				magnitude: change,
				detail: `looped ${pct(baselineLoop)} → ${pct(loop)} of finished runs`
			});
		}
	}
	return flags;
}
