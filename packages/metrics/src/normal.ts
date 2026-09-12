/**
 * **The distributions the intervals rest on** (WP76, `68-METRICS.md` §3.5):
 * the normal CDF and quantile, the regularised incomplete beta (for the
 * Clopper–Pearson bounds and the t distribution), and the t quantile.
 * Small, dependency-free, and tested against tabulated values so a
 * reader can see the numbers came from arithmetic, not a library.
 */

/** The complementary error function, Numerical Recipes' Chebyshev fit: fractional error under 1.2e-7 everywhere. */
export function erfc(x: number): number {
	const z = Math.abs(x);
	const t = 1 / (1 + 0.5 * z);
	const r =
		t *
		Math.exp(
			-z * z -
				1.26551223 +
				t *
					(1.00002368 +
						t *
							(0.37409196 +
								t *
									(0.09678418 +
										t *
											(-0.18628806 +
												t *
													(0.27886807 +
														t *
															(-1.13520398 +
																t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
		);
	return x >= 0 ? r : 2 - r;
}

/** Φ(x), the standard normal CDF. */
export function normalCdf(x: number): number {
	return 0.5 * erfc(-x / Math.SQRT2);
}

/**
 * Φ⁻¹(p): Acklam's rational approximation, relative error under 1.15e-9.
 */
export function normalQuantile(p: number): number {
	if (!(p > 0 && p < 1)) {
		if (p === 0) return -Infinity;
		if (p === 1) return Infinity;
		throw new RangeError(`normalQuantile: p must be in (0, 1), got ${p}`);
	}
	const a = [
		-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
		-3.066479806614716e1, 2.506628277459239
	];
	const b = [
		-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
		-1.328068155288572e1
	];
	const c = [
		-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
		4.374664141464968, 2.938163982698783
	];
	const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
	const low = 0.02425;
	let x: number;
	if (p < low) {
		const q = Math.sqrt(-2 * Math.log(p));
		x =
			(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
			((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
	} else if (p <= 1 - low) {
		const q = p - 0.5;
		const r = q * q;
		x =
			((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
			(((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
	} else {
		const q = Math.sqrt(-2 * Math.log(1 - p));
		x =
			-(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
			((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
	}
	// No Newton refinement: Φ here is the 1.2e-7 erfc fit, coarser than Acklam's 1.15e-9, so a step through it would only add its error.
	return x;
}

/** ln Γ(x), Lanczos. */
export function logGamma(x: number): number {
	const g = [
		76.18009172947146, -86.5053203294168, 24.01409824083091, -1.231739572450155,
		0.1208650973866179e-2, -0.5395239384953e-5
	];
	let y = x;
	const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
	let ser = 1.000000000190015;
	for (const coefficient of g) ser += coefficient / (y += 1);
	return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
	const MAX = 300;
	const EPS = 3e-14;
	const FPMIN = 1e-300;
	const qab = a + b;
	const qap = a + 1;
	const qam = a - 1;
	let c = 1;
	let d = 1 - (qab * x) / qap;
	if (Math.abs(d) < FPMIN) d = FPMIN;
	d = 1 / d;
	let h = d;
	for (let m = 1; m <= MAX; m += 1) {
		const m2 = 2 * m;
		let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		h *= d * c;
		aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
		d = 1 + aa * d;
		if (Math.abs(d) < FPMIN) d = FPMIN;
		c = 1 + aa / c;
		if (Math.abs(c) < FPMIN) c = FPMIN;
		d = 1 / d;
		const del = d * c;
		h *= del;
		if (Math.abs(del - 1) < EPS) break;
	}
	return h;
}

/** I_x(a, b), the regularised incomplete beta function. */
export function betaInc(a: number, b: number, x: number): number {
	if (x <= 0) return 0;
	if (x >= 1) return 1;
	const bt = Math.exp(
		logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
	);
	if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
	return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

/** The beta quantile B(p; a, b), by bisection on I_x. */
export function betaQuantile(p: number, a: number, b: number): number {
	if (p <= 0) return 0;
	if (p >= 1) return 1;
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 200; i += 1) {
		const mid = (lo + hi) / 2;
		if (betaInc(a, b, mid) < p) lo = mid;
		else hi = mid;
		if (hi - lo < 1e-12) break;
	}
	return (lo + hi) / 2;
}

/** P(T ≤ t) for Student's t with `df` degrees of freedom, through the incomplete beta. */
export function tCdf(t: number, df: number): number {
	const x = df / (df + t * t);
	const tail = 0.5 * betaInc(df / 2, 0.5, x);
	return t >= 0 ? 1 - tail : tail;
}

/** The t quantile t_{df, p}, by bisection; the normal quantile past 1,000 degrees of freedom. */
export function tQuantile(p: number, df: number): number {
	if (!(p > 0 && p < 1)) throw new RangeError(`tQuantile: p must be in (0, 1), got ${p}`);
	if (!(df > 0)) throw new RangeError(`tQuantile: df must be positive, got ${df}`);
	if (df > 1000) return normalQuantile(p);
	let lo = -1e3;
	let hi = 1e3;
	for (let i = 0; i < 200; i += 1) {
		const mid = (lo + hi) / 2;
		if (tCdf(mid, df) < p) lo = mid;
		else hi = mid;
		if (hi - lo < 1e-10) break;
	}
	return (lo + hi) / 2;
}

/** ln C(n, k). */
export function logChoose(n: number, k: number): number {
	return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}
