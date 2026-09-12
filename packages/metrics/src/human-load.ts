import { meanInterval, welch, wilson, type Interval } from './intervals.js';

/**
 * **Human load and decision rights** (WP76, `68-METRICS.md` §3.4; `64-…`
 * §6.4.1a, tenet 26; retires G58): what the thought experiment's scenario
 * model assumes — touches per case, minutes per touch, FTE at a volume,
 * decisions taken above their ceiling — measured over cases with their
 * touches and their decisions' autonomy levels. WP79's stage records fold
 * into `TouchedCase`s; until then a fixture does.
 */
export type AutonomyLevel = 1 | 2 | 3 | 4 | 5;

export interface Touch {
	/** `four-eyes`, `returned`, `vulnerability`, `sar-consent`, `human-stage`, … */
	kind: string;
}

export interface TouchedCase {
	id: string;
	touches: Touch[];
	decisions?: Array<{ kind: string; level: AutonomyLevel }> | undefined;
}

export interface LoadResult {
	metric:
		| 'touches-per-case'
		| 'unattended-rate'
		| 'minutes-per-case'
		| 'human-load-at-volume'
		| 'ceiling-breach-rate'
		| 'oversight-cost';
	value: number;
	interval: Interval;
	confidence: number;
	n: number;
	underpowered: boolean;
	method: string;
	detail?: Record<string, number> | undefined;
}

export interface LoadOptions {
	confidence?: number;
	floor?: number;
}

const conf = (o: LoadOptions) => o.confidence ?? 0.95;
const floorOf = (o: LoadOptions) => o.floor ?? 30;

/** Mean touches per case, and per touch kind in `detail`. */
export function touchesPerCase(
	cases: readonly TouchedCase[],
	options: LoadOptions = {}
): LoadResult {
	const counts = cases.map((c) => c.touches.length);
	const byKind: Record<string, number> = {};
	for (const c of cases) for (const t of c.touches) byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
	for (const kind of Object.keys(byKind))
		byKind[kind] = cases.length === 0 ? 0 : byKind[kind]! / cases.length;
	const mean = counts.length === 0 ? 0 : counts.reduce((s, v) => s + v, 0) / counts.length;
	return {
		metric: 'touches-per-case',
		value: mean,
		interval: meanInterval(counts, conf(options)),
		confidence: conf(options),
		n: cases.length,
		underpowered: cases.length < floorOf(options),
		method: 't interval on the mean',
		detail: byKind
	};
}

/** The share of cases with no touch at all. */
export function unattendedRate(
	cases: readonly TouchedCase[],
	options: LoadOptions = {}
): LoadResult {
	const k = cases.filter((c) => c.touches.length === 0).length;
	return {
		metric: 'unattended-rate',
		value: cases.length === 0 ? 0 : k / cases.length,
		interval: wilson(k, cases.length, conf(options)),
		confidence: conf(options),
		n: cases.length,
		underpowered: cases.length < floorOf(options),
		method: 'wilson'
	};
}

/** Minutes per case from a minutes-per-touch table the host passes (a calibration-style row; an assumption that says so). A kind the table lacks counts as `other`, or 0 without one. */
export function minutesPerCase(
	cases: readonly TouchedCase[],
	minutesPerTouch: Readonly<Record<string, number>>,
	options: LoadOptions = {}
): LoadResult {
	const minutes = cases.map((c) =>
		c.touches.reduce(
			(sum, t) => sum + (minutesPerTouch[t.kind] ?? minutesPerTouch['other'] ?? 0),
			0
		)
	);
	const mean = minutes.length === 0 ? 0 : minutes.reduce((s, v) => s + v, 0) / minutes.length;
	return {
		metric: 'minutes-per-case',
		value: mean,
		interval: meanInterval(minutes, conf(options)),
		confidence: conf(options),
		n: cases.length,
		underpowered: cases.length < floorOf(options),
		method: 't interval on the mean; minutes per touch from the stated table'
	};
}

/** FTE-days per day: minutes per case × arrivals per day ÷ productive minutes per FTE-day (390 by default, stated). */
export function humanLoadAtVolume(
	minutes: LoadResult,
	arrivalsPerDay: number,
	productiveMinutesPerFteDay = 390
): LoadResult {
	const scale = arrivalsPerDay / productiveMinutesPerFteDay;
	return {
		metric: 'human-load-at-volume',
		value: minutes.value * scale,
		interval: [minutes.interval[0] * scale, minutes.interval[1] * scale],
		confidence: minutes.confidence,
		n: minutes.n,
		underpowered: minutes.underpowered,
		method: `${minutes.method}; × ${arrivalsPerDay} arrivals per day ÷ ${productiveMinutesPerFteDay} productive minutes per FTE-day (an assumption)`,
		detail: { arrivalsPerDay, productiveMinutesPerFteDay }
	};
}

/** The share of decisions taken at a level above their kind's ceiling (the decision-rights table). A kind without a ceiling is not counted. */
export function ceilingBreachRate(
	cases: readonly TouchedCase[],
	ceilings: Readonly<Record<string, AutonomyLevel>>,
	options: LoadOptions = {}
): LoadResult {
	let decisions = 0;
	let breaches = 0;
	const byKind: Record<string, number> = {};
	for (const c of cases) {
		for (const d of c.decisions ?? []) {
			const ceiling = ceilings[d.kind];
			if (ceiling === undefined) continue;
			decisions += 1;
			if (d.level > ceiling) {
				breaches += 1;
				byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
			}
		}
	}
	return {
		metric: 'ceiling-breach-rate',
		value: decisions === 0 ? 0 : breaches / decisions,
		interval: wilson(breaches, decisions, conf(options)),
		confidence: conf(options),
		n: decisions,
		underpowered: decisions < floorOf(options),
		method:
			'wilson over decisions with a ceiling; a breach is a level above the kind’s ceiling — measured, never prevented',
		detail: byKind
	};
}

/** The change in touches per case a control introduces: treatment − baseline, Welch's interval. */
export function oversightCost(
	baseline: readonly TouchedCase[],
	treatment: readonly TouchedCase[],
	options: LoadOptions = {}
): LoadResult {
	const a = treatment.map((c) => c.touches.length);
	const b = baseline.map((c) => c.touches.length);
	const { delta, interval, df } = welch(a, b, conf(options));
	return {
		metric: 'oversight-cost',
		value: delta,
		interval,
		confidence: conf(options),
		n: Math.min(a.length, b.length),
		underpowered: a.length < floorOf(options) || b.length < floorOf(options),
		method: 'welch on the difference of mean touches per case',
		detail: { df, baseline: b.length, treatment: a.length }
	};
}
