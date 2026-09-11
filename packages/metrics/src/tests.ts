import { logChoose, normalCdf } from './normal.js';

/**
 * **The tests** (WP76, `68-METRICS.md` §3.5): reported as `p` on a result,
 * never read by a gate (`64-…` §6.4.1). Two-proportion z, Fisher's exact on
 * the 2 × 2, the sign test on discordant pairs, the two-sample Kolmogorov–
 * Smirnov statistic with its asymptotic p.
 */
export interface TestResult {
	test: string;
	statistic: number;
	p: number;
}

/** Two-sided two-proportion z test on k₁/n₁ against k₂/n₂ with the pooled rate. */
export function twoProportionZ(k1: number, n1: number, k2: number, n2: number): TestResult {
	if (n1 === 0 || n2 === 0) return { test: 'two-proportion-z', statistic: 0, p: 1 };
	const pooled = (k1 + k2) / (n1 + n2);
	const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
	if (se === 0) return { test: 'two-proportion-z', statistic: 0, p: 1 };
	const z = (k1 / n1 - k2 / n2) / se;
	return {
		test: 'two-proportion-z',
		statistic: z,
		p: Math.min(1, 2 * (1 - normalCdf(Math.abs(z))))
	};
}

/**
 * Fisher's exact test on the table [[a, b], [c, d]], two-sided: the sum of
 * the hypergeometric probabilities of every table with the same margins
 * that is no more likely than the observed one.
 */
export function fisherExact(a: number, b: number, c: number, d: number): TestResult {
	const row1 = a + b;
	const row2 = c + d;
	const col1 = a + c;
	const n = row1 + row2;
	if (n === 0) return { test: 'fisher-exact', statistic: 0, p: 1 };
	const logP = (x: number) => logChoose(row1, x) + logChoose(row2, col1 - x) - logChoose(n, col1);
	const observed = logP(a);
	let total = 0;
	const lo = Math.max(0, col1 - row2);
	const hi = Math.min(row1, col1);
	for (let x = lo; x <= hi; x += 1) {
		const lp = logP(x);
		if (lp <= observed + 1e-9) total += Math.exp(lp);
	}
	const odds = b * c === 0 ? (a * d === 0 ? 1 : Infinity) : (a * d) / (b * c);
	return { test: 'fisher-exact', statistic: odds, p: Math.min(1, total) };
}

/** P(X ≤ k) under Binomial(m, ½), the coefficients built by multiplication so small cases are exact. */
function binomialHalfCdf(k: number, m: number): number {
	let total = 0;
	if (m <= 1000) {
		// The exact product: 2 of 3 reads 1, not 0.99999….
		let choose = 1;
		const scale = Math.pow(0.5, m);
		for (let x = 0; x <= k; x += 1) {
			if (x > 0) choose = (choose * (m - x + 1)) / x;
			total += choose * scale;
		}
		return Math.min(1, total);
	}
	// In log space (WP89): the product form overflows past a thousand pairs and read NaN.
	const logHalf = -m * Math.LN2;
	for (let x = 0; x <= k; x += 1) total += Math.exp(logChoose(m, x) + logHalf);
	return Math.min(1, total);
}

/** The sign test: k of m discordant pairs favouring the first side; two-sided. */
export function signTest(k: number, m: number): TestResult {
	if (m === 0) return { test: 'sign', statistic: 0, p: 1 };
	const lower = binomialHalfCdf(k, m);
	const upper = 1 - (k === 0 ? 0 : binomialHalfCdf(k - 1, m));
	return { test: 'sign', statistic: k, p: Math.min(1, 2 * Math.min(lower, upper)) };
}

/** Q_KS(λ) = 2 Σ (−1)^(j−1) e^(−2 j² λ²). */
export function kolmogorovQ(lambda: number): number {
	if (lambda <= 0) return 1;
	let sum = 0;
	let sign = 1;
	for (let j = 1; j <= 100; j += 1) {
		const term = sign * Math.exp(-2 * j * j * lambda * lambda);
		sum += term;
		if (Math.abs(term) < 1e-12) break;
		sign = -sign;
	}
	return Math.min(1, Math.max(0, 2 * sum));
}

/** The two-sample Kolmogorov–Smirnov test: D and its asymptotic p with Stephens' correction. */
export function ksTwoSample(a: readonly number[], b: readonly number[]): TestResult {
	const n1 = a.length;
	const n2 = b.length;
	if (n1 === 0 || n2 === 0) return { test: 'kolmogorov-smirnov', statistic: 0, p: 1 };
	const sa = [...a].sort((x, y) => x - y);
	const sb = [...b].sort((x, y) => x - y);
	let i = 0;
	let j = 0;
	let d = 0;
	while (i < n1 && j < n2) {
		const x = Math.min(sa[i]!, sb[j]!);
		while (i < n1 && sa[i]! <= x) i += 1;
		while (j < n2 && sb[j]! <= x) j += 1;
		d = Math.max(d, Math.abs(i / n1 - j / n2));
	}
	const ne = (n1 * n2) / (n1 + n2);
	const lambda = (Math.sqrt(ne) + 0.12 + 0.11 / Math.sqrt(ne)) * d;
	return { test: 'kolmogorov-smirnov', statistic: d, p: kolmogorovQ(lambda) };
}
