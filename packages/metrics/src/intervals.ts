import { betaQuantile, normalQuantile, tQuantile } from './normal.js';

/**
 * **The intervals** (WP76, `68-METRICS.md` §3.5): every rate carries
 * Wilson, every difference of rates Newcombe, every ratio the log-ratio,
 * every exact count Clopper–Pearson, every mean the t interval, every
 * difference of means Welch. A result names which it used in `method`.
 */
export type Interval = [number, number];

export const zFor = (confidence: number): number => normalQuantile(1 - (1 - confidence) / 2);

/** The Wilson score interval for k of n; [0, 1] when n is 0. */
export function wilson(k: number, n: number, confidence = 0.95): Interval {
	if (n <= 0) return [0, 1];
	const z = zFor(confidence);
	// The ends are exact at the boundaries: no success means a lower bound of exactly 0, not a rounding whisker above it.
	if (k <= 0) return [0, wilsonBound(0, n, z, 1)];
	if (k >= n) return [wilsonBound(1, n, z, -1), 1];
	const p = k / n;
	return [Math.max(0, wilsonBound(p, n, z, -1)), Math.min(1, wilsonBound(p, n, z, 1))];
}

function wilsonBound(p: number, n: number, z: number, side: -1 | 1): number {
	const z2 = z * z;
	const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
	const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
	return centre + side * half;
}

/** Newcombe's hybrid score interval (method 10) for p₁ − p₂. */
export function newcombe(
	k1: number,
	n1: number,
	k2: number,
	n2: number,
	confidence = 0.95
): Interval {
	const p1 = n1 > 0 ? k1 / n1 : 0;
	const p2 = n2 > 0 ? k2 / n2 : 0;
	const [l1, u1] = wilson(k1, n1, confidence);
	const [l2, u2] = wilson(k2, n2, confidence);
	const d = p1 - p2;
	return [
		d - Math.sqrt((p1 - l1) ** 2 + (u2 - p2) ** 2),
		d + Math.sqrt((u1 - p1) ** 2 + (p2 - l2) ** 2)
	];
}

/**
 * The log-ratio interval for p₁ / p₂ (a relative risk). A zero cell adds
 * 0.5 to every cell (Haldane–Anscombe) and the caller says so in `method`.
 */
export function logRatio(
	k1: number,
	n1: number,
	k2: number,
	n2: number,
	confidence = 0.95
): { interval: Interval; corrected: boolean } {
	const corrected = k1 === 0 || k2 === 0 || k1 === n1 || k2 === n2;
	const a = corrected ? k1 + 0.5 : k1;
	const b = corrected ? k2 + 0.5 : k2;
	const m1 = corrected ? n1 + 1 : n1;
	const m2 = corrected ? n2 + 1 : n2;
	const ratio = a / m1 / (b / m2);
	const se = Math.sqrt(1 / a - 1 / m1 + 1 / b - 1 / m2);
	const z = zFor(confidence);
	return {
		interval: [ratio * Math.exp(-z * se), ratio * Math.exp(z * se)],
		corrected
	};
}

/** The Clopper–Pearson exact interval for k of n. */
export function clopperPearson(k: number, n: number, confidence = 0.95): Interval {
	if (n <= 0) return [0, 1];
	const alpha = 1 - confidence;
	const lo = k === 0 ? 0 : betaQuantile(alpha / 2, k, n - k + 1);
	const hi = k === n ? 1 : betaQuantile(1 - alpha / 2, k + 1, n - k);
	return [lo, hi];
}

export interface Summary {
	n: number;
	mean: number;
	/** The sample standard deviation (n − 1); 0 for fewer than two values. */
	sd: number;
}

export function summarise(values: readonly number[]): Summary {
	const n = values.length;
	if (n === 0) return { n: 0, mean: 0, sd: 0 };
	const mean = values.reduce((sum, v) => sum + v, 0) / n;
	if (n < 2) return { n, mean, sd: 0 };
	const ss = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
	return { n, mean, sd: Math.sqrt(ss / (n - 1)) };
}

/** The t interval for a mean: x̄ ± t_{n−1} s/√n; the point alone with fewer than two values. */
export function meanInterval(values: readonly number[], confidence = 0.95): Interval {
	const { n, mean, sd } = summarise(values);
	if (n < 2) return [mean, mean];
	const half = (tQuantile(1 - (1 - confidence) / 2, n - 1) * sd) / Math.sqrt(n);
	return [mean - half, mean + half];
}

/** Welch's interval for a difference of means, with the Welch–Satterthwaite degrees of freedom. */
export function welch(
	a: readonly number[],
	b: readonly number[],
	confidence = 0.95
): { delta: number; interval: Interval; df: number } {
	const sa = summarise(a);
	const sb = summarise(b);
	const delta = sa.mean - sb.mean;
	if (sa.n < 2 || sb.n < 2) return { delta, interval: [delta, delta], df: 0 };
	const va = (sa.sd * sa.sd) / sa.n;
	const vb = (sb.sd * sb.sd) / sb.n;
	const se = Math.sqrt(va + vb);
	if (se === 0) return { delta, interval: [delta, delta], df: sa.n + sb.n - 2 };
	const df = (va + vb) ** 2 / ((va * va) / (sa.n - 1) + (vb * vb) / (sb.n - 1));
	const half = tQuantile(1 - (1 - confidence) / 2, df) * se;
	return { delta, interval: [delta - half, delta + half], df };
}
