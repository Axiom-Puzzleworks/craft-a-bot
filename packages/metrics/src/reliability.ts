import { wilson, type Interval } from './intervals.js';
import { mulberry32 } from './random.js';

/**
 * **Reliability over trials** (WP191, `113-RECORDING-AND-RELIABILITY.md`
 * §4.7). A model's answer to one prompt is not repeatable, so a cell is
 * performed `n` times — the trials of one item, with fresh model draws — and
 * these measures say how often it comes out the same. The unit is the
 * *item* (a case), never the trial: `n` trials of one item are one
 * observation of how that item goes, so an interval is over items and the
 * trials do not inflate the sample.
 *
 * - **pass@k** — some performance of `k` succeeds (capability);
 * - **pass^k** — every performance of `k` succeeds (reliability: a control
 *   that holds only some of the time is not a control);
 * - **consistency** — all of an item's trials reach the same outcome.
 *
 * Per item with `c` passes of `n` trials, the unbiased estimators are
 * `1 − C(n−c, k) / C(n, k)` and `C(c, k) / C(n, k)`; at `n = k` they read
 * "at least one" and "all".
 */

/** The number of ways to choose `k` of `n`, exact for the small counts trials are. */
export function choose(n: number, k: number): number {
	if (k < 0 || k > n) return 0;
	const m = Math.min(k, n - k);
	let result = 1;
	for (let i = 1; i <= m; i += 1) result = (result * (n - m + i)) / i;
	return Math.round(result);
}

/** One item's pass@k from `c` passes of `n` trials: the chance a random `k` of them hold a pass. `undefined` below `k` trials. */
export function passAtK(n: number, c: number, k: number): number | undefined {
	if (k < 1 || n < k) return undefined;
	return 1 - choose(n - c, k) / choose(n, k);
}

/** One item's pass^k from `c` passes of `n` trials: the chance a random `k` of them are all passes. `undefined` below `k` trials. */
export function passHatK(n: number, c: number, k: number): number | undefined {
	if (k < 1 || n < k) return undefined;
	return choose(c, k) / choose(n, k);
}

/** One item: how many of its trials passed. */
export interface TrialItem {
	passes: number;
	trials: number;
}

export interface Estimate {
	value: number;
	interval: Interval;
	/** How the interval was made: Wilson on items when every item reads 0 or 1, else a seeded percentile bootstrap over items. */
	method: string;
}

export interface ReliabilityResult {
	/** Items counted: those with at least `k` trials. */
	items: number;
	/** Items left out for having fewer than `k` trials. */
	skipped: number;
	k: number;
	/** Expected pass rate of one performance, `c / n` averaged over items. */
	pass1: Estimate;
	passAtK: Estimate;
	passHatK: Estimate;
	/** The share of items whose trials all reached the same outcome. */
	consistency: Estimate;
}

export interface ReliabilityOptions {
	confidence?: number;
	seed?: number;
	resamples?: number;
}

/**
 * A percentile bootstrap interval for the mean of `values`, resampling
 * *items* with a seeded generator, so the same items give the same interval.
 */
export function bootstrapMeanInterval(
	values: readonly number[],
	options: ReliabilityOptions = {}
): Interval {
	const n = values.length;
	if (n === 0) return [0, 1];
	const confidence = options.confidence ?? 0.95;
	const resamples = options.resamples ?? 2000;
	const random = mulberry32(options.seed ?? 1);
	const means: number[] = [];
	for (let r = 0; r < resamples; r += 1) {
		let sum = 0;
		for (let i = 0; i < n; i += 1) sum += values[Math.floor(random() * n)]!;
		means.push(sum / n);
	}
	means.sort((a, b) => a - b);
	const tail = (1 - confidence) / 2;
	const at = (q: number) => means[Math.min(resamples - 1, Math.max(0, Math.floor(q * resamples)))]!;
	return [at(tail), at(1 - tail)];
}

const meanOf = (values: readonly number[]): number =>
	values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;

/** A mean over items with its interval: Wilson when every item reads 0 or 1 (a count of items), else the bootstrap. */
export function itemEstimate(
	values: readonly number[],
	options: ReliabilityOptions = {}
): Estimate {
	const confidence = options.confidence ?? 0.95;
	const value = meanOf(values);
	if (values.every((held) => held === 0 || held === 1)) {
		return {
			value,
			interval: wilson(values.filter((held) => held === 1).length, values.length, confidence),
			method: `Wilson interval over ${values.length} items`
		};
	}
	return {
		value,
		interval: bootstrapMeanInterval(values, options),
		method: `percentile bootstrap over ${values.length} items, ${options.resamples ?? 2000} resamples`
	};
}

/** The reliability of a set of items at `k`: pass@1, pass@k, pass^k and consistency, each with an interval over items. */
export function itemReliability(
	items: readonly TrialItem[],
	k: number,
	options: ReliabilityOptions = {}
): ReliabilityResult {
	const counted = items.filter((item) => item.trials >= k);
	const per = (fn: (item: TrialItem) => number) => counted.map(fn);
	return {
		items: counted.length,
		skipped: items.length - counted.length,
		k,
		pass1: itemEstimate(
			per((item) => item.passes / item.trials),
			options
		),
		passAtK: itemEstimate(
			per((item) => passAtK(item.trials, item.passes, k)!),
			options
		),
		passHatK: itemEstimate(
			per((item) => passHatK(item.trials, item.passes, k)!),
			options
		),
		consistency: itemEstimate(
			per((item) => (item.passes === 0 || item.passes === item.trials ? 1 : 0)),
			options
		)
	};
}

/** Whether an item's trials were all the same outcome is not the whole of repeatability; this is how far two paths ran together. */
export function firstDivergence(a: readonly string[], b: readonly string[]): number | undefined {
	const shared = Math.min(a.length, b.length);
	for (let i = 0; i < shared; i += 1) if (a[i] !== b[i]) return i;
	return a.length === b.length ? undefined : shared;
}

/** The edit distance between two action sequences: how far two trials' paths forked. */
export function pathDistance(a: readonly string[], b: readonly string[]): number {
	let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i += 1) {
		const row = [i];
		for (let j = 1; j <= b.length; j += 1) {
			row.push(
				Math.min(
					previous[j]! + 1,
					row[j - 1]! + 1,
					previous[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1)
				)
			);
		}
		previous = row;
	}
	return previous[b.length]!;
}

/** What one trial did at its first tick: the call it made and the words it gave. The prompts are identical across trials, so any difference is the model's own. */
export interface FirstTick {
	call: string;
	words: string;
}

/** For one item's trials: of every pair, whether the first call, and the first words, were the same. */
export function firstTickAgreement(trials: readonly FirstTick[]): {
	pairs: number;
	sameCall: number;
	sameWords: number;
} {
	let pairs = 0;
	let sameCall = 0;
	let sameWords = 0;
	for (let i = 0; i < trials.length; i += 1)
		for (let j = i + 1; j < trials.length; j += 1) {
			pairs += 1;
			if (trials[i]!.call === trials[j]!.call) sameCall += 1;
			if (trials[i]!.words === trials[j]!.words) sameWords += 1;
		}
	return { pairs, sameCall, sameWords };
}
