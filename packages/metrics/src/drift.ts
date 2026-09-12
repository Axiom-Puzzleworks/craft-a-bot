import { newcombe, type Interval } from './intervals.js';
import { ksTwoSample } from './tests.js';
import {
	fairnessMetric,
	type DecidedCase,
	type FairnessMetricId,
	type FairnessOptions
} from './fairness.js';

/**
 * **Drift** (WP76, `68-METRICS.md` §3.3; `64-…` §6.4.2): six comparisons
 * of a current set against a reference — the population stability index
 * per feature, Kolmogorov–Smirnov, the outcome-mix distance
 * (`governance`'s `mixDistance`, moved here), agreement drift, fairness
 * drift, and the Page–Hinkley detector for the slow ramp a window
 * comparison misses. The conventions (PSI's 0.10 and 0.25) are named on
 * the result, never implied.
 */
export interface PsiResult {
	metric: 'psi';
	value: number;
	/** The bins, fixed from the reference: an edge list for a number, a category list for a string. */
	bins: string[];
	reference: number[];
	current: number[];
	n: { reference: number; current: number };
	/** `stable` under 0.10, `watch` to 0.25, `act` above — the usual convention, stated. */
	reading: 'stable' | 'watch' | 'act';
	method: string;
}

const EPSILON = 1e-4;

/** PSI over a categorical feature: Σ (c − r) ln(c / r) with shares floored at 1e-4. */
export function psiCategorical(
	reference: readonly string[],
	current: readonly string[]
): PsiResult {
	const categories = [...new Set([...reference, ...current])].sort();
	const share = (values: readonly string[]) =>
		categories.map((category) =>
			values.length === 0 ? 0 : values.filter((v) => v === category).length / values.length
		);
	return finishPsi(
		categories,
		share(reference),
		share(current),
		reference.length,
		current.length,
		'categories'
	);
}

/** PSI over a numeric feature: the reference's deciles as bins (fewer when it has fewer distinct values). */
export function psiNumeric(
	reference: readonly number[],
	current: readonly number[],
	bins = 10
): PsiResult {
	const sorted = [...reference].sort((a, b) => a - b);
	const edges: number[] = [];
	for (let i = 1; i < bins; i += 1) {
		const edge = sorted[Math.min(sorted.length - 1, Math.floor((i * sorted.length) / bins))];
		if (edge !== undefined && (edges.length === 0 || edge > edges[edges.length - 1]!))
			edges.push(edge);
	}
	const binOf = (value: number) => {
		let index = 0;
		while (index < edges.length && value >= edges[index]!) index += 1;
		return index;
	};
	const share = (values: readonly number[]) => {
		const counts = new Array<number>(edges.length + 1).fill(0);
		for (const v of values) counts[binOf(v)]! += 1;
		return counts.map((c) => (values.length === 0 ? 0 : c / values.length));
	};
	const labels = [
		...edges.map((edge, i) => (i === 0 ? `< ${edge}` : `[${edges[i - 1]}, ${edge})`)),
		`≥ ${edges[edges.length - 1] ?? '−∞'}`
	];
	return finishPsi(
		labels,
		share(reference),
		share(current),
		reference.length,
		current.length,
		'reference deciles'
	);
}

function finishPsi(
	bins: string[],
	reference: number[],
	current: number[],
	nRef: number,
	nCur: number,
	binning: string
): PsiResult {
	let value = 0;
	for (let i = 0; i < bins.length; i += 1) {
		const r = Math.max(EPSILON, reference[i] ?? 0);
		const c = Math.max(EPSILON, current[i] ?? 0);
		value += (c - r) * Math.log(c / r);
	}
	return {
		metric: 'psi',
		value,
		bins,
		reference,
		current,
		n: { reference: nRef, current: nCur },
		reading: value < 0.1 ? 'stable' : value <= 0.25 ? 'watch' : 'act',
		method: `population stability index over ${binning}, shares floored at ${EPSILON}; stable < 0.10, watch ≤ 0.25, act above (a convention)`
	};
}

export interface KsResult {
	metric: 'ks';
	value: number;
	p: number;
	n: { reference: number; current: number };
	method: string;
}

/** The two-sample Kolmogorov–Smirnov statistic between a reference and a current feature. */
export function ksDrift(reference: readonly number[], current: readonly number[]): KsResult {
	const { statistic, p } = ksTwoSample(reference, current);
	return {
		metric: 'ks',
		value: statistic,
		p,
		n: { reference: reference.length, current: current.length },
		method: 'two-sample kolmogorov–smirnov, asymptotic p with stephens’ correction'
	};
}

/** ½ Σ |p − q| over the union of categories; 0 when both are empty, 1 when exactly one is. */
export function totalVariationDistance(
	a: Readonly<Record<string, number>>,
	b: Readonly<Record<string, number>>
): number {
	const shares = (counts: Readonly<Record<string, number>>) => {
		const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
		const out = new Map<string, number>();
		if (total === 0) return out;
		for (const [id, count] of Object.entries(counts)) out.set(id, count / total);
		return out;
	};
	const p = shares(a);
	const q = shares(b);
	if (p.size === 0 && q.size === 0) return 0;
	if (p.size === 0 || q.size === 0) return 1;
	const ids = new Set([...p.keys(), ...q.keys()]);
	let sum = 0;
	for (const id of ids) sum += Math.abs((p.get(id) ?? 0) - (q.get(id) ?? 0));
	return sum / 2;
}

export interface MixResult {
	metric: 'outcome-mix';
	value: number;
	n: { reference: number; current: number };
	method: string;
}

/** The outcome-mix distance over two sets of categorical outcomes. */
export function outcomeMixDistance(
	reference: readonly string[],
	current: readonly string[]
): MixResult {
	const counts = (values: readonly string[]) => {
		const out: Record<string, number> = {};
		for (const v of values) out[v] = (out[v] ?? 0) + 1;
		return out;
	};
	return {
		metric: 'outcome-mix',
		value: totalVariationDistance(counts(reference), counts(current)),
		n: { reference: reference.length, current: current.length },
		method: 'total-variation distance over the outcome shares'
	};
}

export interface DifferenceResult {
	metric: 'agreement' | FairnessMetricId;
	/** current − reference. */
	value: number;
	reference: number;
	current: number;
	interval: Interval;
	confidence: number;
	n: { reference: number; current: number };
	underpowered: boolean;
	method: string;
}

/** P(decision = verdict) in the current set minus in the reference set. */
export function agreementDrift(
	reference: readonly DecidedCase[],
	current: readonly DecidedCase[],
	options: FairnessOptions = {}
): DifferenceResult {
	const confidence = options.confidence ?? 0.95;
	const floor = options.floor ?? 30;
	const count = (cases: readonly DecidedCase[]) => {
		const judged = cases.filter((c) => c.verdict !== undefined);
		return { k: judged.filter((c) => c.decision === c.verdict).length, n: judged.length };
	};
	const r = count(reference);
	const c = count(current);
	const pr = r.n === 0 ? 0 : r.k / r.n;
	const pc = c.n === 0 ? 0 : c.k / c.n;
	return {
		metric: 'agreement',
		value: pc - pr,
		reference: pr,
		current: pc,
		interval: newcombe(c.k, c.n, r.k, r.n, confidence),
		confidence,
		n: { reference: r.n, current: c.n },
		underpowered: r.n < floor || c.n < floor,
		method: 'newcombe on the difference of agreement rates'
	};
}

/** Any fairness metric in the current set minus in the reference set; the two half-widths combined in quadrature. */
export function fairnessDrift(
	metric: Exclude<FairnessMetricId, 'counterfactual-flip'>,
	reference: readonly DecidedCase[],
	current: readonly DecidedCase[],
	options: FairnessOptions = {}
): DifferenceResult {
	const r = fairnessMetric(metric, reference, options);
	const c = fairnessMetric(metric, current, options);
	const half = Math.sqrt(
		((r.interval[1] - r.interval[0]) / 2) ** 2 + ((c.interval[1] - c.interval[0]) / 2) ** 2
	);
	const value = c.value - r.value;
	return {
		metric,
		value,
		reference: r.value,
		current: c.value,
		interval: [value - half, value + half],
		confidence: c.confidence,
		n: { reference: reference.length, current: current.length },
		underpowered: r.underpowered || c.underpowered,
		method: `${c.method}; the two half-widths combined in quadrature`
	};
}

export interface PageHinkleyResult {
	metric: 'page-hinkley';
	/** The index at which the detector first raised, or undefined. */
	detectedAt: number | undefined;
	/** PH_t at every t. */
	statistic: number[];
	delta: number;
	lambda: number;
	method: string;
}

/** The Page–Hinkley detector for an upward ramp: m_t = Σ (x_i − x̄_i − δ), PH_t = m_t − min m_t, raised when PH_t > λ. */
export function pageHinkley(
	series: readonly number[],
	options: { delta?: number; lambda?: number } = {}
): PageHinkleyResult {
	const delta = options.delta ?? 0.005;
	const lambda = options.lambda ?? 0.05;
	let sum = 0;
	let m = 0;
	let min = 0;
	let detectedAt: number | undefined;
	const statistic: number[] = [];
	for (let t = 0; t < series.length; t += 1) {
		sum += series[t]!;
		const mean = sum / (t + 1);
		m += series[t]! - mean - delta;
		min = Math.min(min, m);
		const ph = m - min;
		statistic.push(ph);
		if (detectedAt === undefined && ph > lambda) detectedAt = t;
	}
	return {
		metric: 'page-hinkley',
		detectedAt,
		statistic,
		delta,
		lambda,
		method: `page–hinkley, δ = ${delta}, λ = ${lambda}`
	};
}
