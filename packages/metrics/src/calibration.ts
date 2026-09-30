import { meanInterval, wilson, type Interval } from './intervals.js';
import { mulberry32 } from './random.js';

/**
 * **Calibration** (WP118, `104-READERS.md` §9; `100-TARGET-DESIGN-V7.md` §6.3,
 * G81): whether a reader's stated probability means what it says. Four
 * figures over the answers a reader gave, each against the label a person
 * wrote:
 *
 * - **the reliability table**: the answers binned by the probability the
 *   reader put on its own choice, each bin's mean probability beside the
 *   share of that bin it got right;
 * - **the expected calibration error**: the gap between those two, weighted by
 *   each bin's share of the answers;
 * - **the Brier score**: the squared distance between the whole distribution
 *   and the label, summed over the options and averaged over the answers;
 * - **the gate curve**: at each threshold, the share of answers a gate would
 *   send to a person and the accuracy of the ones it would let through.
 *
 * The bins default to ten of equal width. The edges can be given instead, as
 * the branch's analysis gave them (`98-JEV.md` §9).
 */

/** One answer to one question, with the label it is scored against. */
export interface CalibratedAnswer {
	/** The option the reader chose. */
	choice: string;
	/** The option the label says was right. */
	label: string;
	/** The reader's distribution over the options. */
	probabilities: Record<string, number>;
	/** The gate's confidence (`(n·p_max − 1)/(n − 1)`); `null` when the reader returned none. */
	confidence: number | null;
	/** P(the caller steered the answer), when the reader was asked. */
	steer?: number | undefined;
}

export interface Rate {
	k: number;
	n: number;
	value: number;
	interval: Interval;
}

export interface ReliabilityBin {
	/** The bin's lower edge, inclusive. */
	from: number;
	/** The bin's upper edge: exclusive, except for the last bin, which includes it. */
	to: number;
	n: number;
	/** The mean probability the reader put on its own choice, over the bin (0 in an empty bin). */
	meanProbability: number;
	/** The share of the bin it got right, with its Wilson interval. */
	accuracy: Rate;
}

export interface CalibrationOptions {
	/** Ascending bin edges from 0 to 1 (or just past it); ten equal bins when absent. */
	edges?: readonly number[] | undefined;
}

/** Ten bins of equal width: 0, 0.1, …, 1. */
export const TEN_BINS: readonly number[] = Array.from({ length: 11 }, (_, i) => i / 10);

/** The gate's thresholds the curve is read at by default: TypeSafe's bands and two above them. */
export const GATE_THRESHOLDS: readonly number[] = [0, 0.6, 0.8, 0.9, 0.95, 0.99];

const rateOf = (k: number, n: number): Rate => ({
	k,
	n,
	value: n === 0 ? 0 : k / n,
	interval: wilson(k, n)
});

/** The probability a reader put on the option it chose. */
export const statedProbability = (answer: CalibratedAnswer): number =>
	answer.probabilities[answer.choice] ?? 0;

function binIndex(p: number, edges: readonly number[]): number {
	const last = edges.length - 2;
	for (let i = 0; i < last; i += 1) if (p < edges[i + 1]!) return i;
	return last;
}

/** **The reliability table**: one row per bin, the empty ones included. */
export function reliability(
	answers: readonly CalibratedAnswer[],
	options: CalibrationOptions = {}
): ReliabilityBin[] {
	const edges = options.edges ?? TEN_BINS;
	const bins = edges.slice(0, -1).map(() => ({ n: 0, sum: 0, right: 0 }));
	for (const answer of answers) {
		const p = statedProbability(answer);
		const bin = bins[binIndex(p, edges)]!;
		bin.n += 1;
		bin.sum += p;
		if (answer.choice === answer.label) bin.right += 1;
	}
	return bins.map((bin, i) => ({
		from: edges[i]!,
		to: Math.min(1, edges[i + 1]!),
		n: bin.n,
		meanProbability: bin.n === 0 ? 0 : bin.sum / bin.n,
		accuracy: rateOf(bin.right, bin.n)
	}));
}

const eceOf = (bins: readonly ReliabilityBin[], n: number): number =>
	n === 0
		? 0
		: bins.reduce(
				(sum, bin) => sum + bin.n * Math.abs(bin.meanProbability - bin.accuracy.value),
				0
			) / n;

export interface CalibrationResult {
	metric: 'ece' | 'brier';
	value: number;
	/** ECE: the percentile bootstrap's (seeded); Brier: the t interval on the mean. */
	interval: Interval;
	n: number;
}

export interface EceOptions extends CalibrationOptions {
	/** Bootstrap resamples for the interval (default 500); 0 gives the point as its own interval. */
	resamples?: number;
	/** The bootstrap's seed (default 1), so the interval is the same every run. */
	seed?: number;
}

/**
 * **The expected calibration error**: Σ over bins of (n_b / n)·|p̄_b − acc_b|,
 * 0 for a reader whose stated probabilities are the rates it is right at. The
 * interval is a seeded percentile bootstrap over the answers. ECE is biased
 * upward in a finite sample, so a calibrated reader's interval need not
 * reach 0: whether it is miscalibrated is `calibrationTest`'s question.
 */
export function expectedCalibrationError(
	answers: readonly CalibratedAnswer[],
	options: EceOptions = {}
): CalibrationResult {
	const n = answers.length;
	const value = eceOf(reliability(answers, options), n);
	const resamples = options.resamples ?? 500;
	if (resamples <= 0 || n === 0) return { metric: 'ece', value, interval: [value, value], n };
	const random = mulberry32(options.seed ?? 1);
	const draws: number[] = [];
	for (let r = 0; r < resamples; r += 1) {
		const sample = Array.from({ length: n }, () => answers[Math.floor(random() * n)]!);
		draws.push(eceOf(reliability(sample, options), n));
	}
	draws.sort((a, b) => a - b);
	const at = (q: number) => draws[Math.min(resamples - 1, Math.floor(q * resamples))]!;
	return { metric: 'ece', value, interval: [at(0.025), at(0.975)], n };
}

/**
 * **A test for miscalibration**: the bins whose accuracy's Wilson interval, at
 * 95% with a Bonferroni correction over the non-empty bins, misses the bin's
 * mean stated probability. A calibrated reader flags no bin 95% of the time or
 * more.
 */
export function calibrationTest(
	answers: readonly CalibratedAnswer[],
	options: CalibrationOptions = {}
): { miscalibrated: boolean; bins: ReliabilityBin[] } {
	const bins = reliability(answers, options);
	const filled = bins.filter((bin) => bin.n > 0);
	const confidence = 1 - 0.05 / Math.max(1, filled.length);
	const flagged = filled.filter((bin) => {
		const [lower, upper] = wilson(bin.accuracy.k, bin.n, confidence);
		return bin.meanProbability < lower || bin.meanProbability > upper;
	});
	return { miscalibrated: flagged.length > 0, bins: flagged };
}

/**
 * **The Brier score**, multi-class: the mean over answers of Σ over options of
 * (p_o − [o is the label])². 0 is certain and right; 2 is certain and wrong.
 * The interval is the t interval on the per-answer scores.
 */
export function brierScore(answers: readonly CalibratedAnswer[]): CalibrationResult {
	const scores = answers.map((answer) => {
		const options = new Set([...Object.keys(answer.probabilities), answer.label]);
		let sum = 0;
		for (const option of options)
			sum += ((answer.probabilities[option] ?? 0) - (option === answer.label ? 1 : 0)) ** 2;
		return sum;
	});
	const n = scores.length;
	const value = n === 0 ? 0 : scores.reduce((a, b) => a + b, 0) / n;
	return { metric: 'brier', value, interval: n < 2 ? [value, value] : meanInterval(scores), n };
}

export interface GatePoint {
	threshold: number;
	/** The share of answers the gate sends to a person: under the threshold, `null`, or steered. */
	reviewed: Rate;
	/** The accuracy of the answers it lets through. */
	residualAccuracy: Rate;
	/** Right end to end, if the person is always right: the let-through right plus everything reviewed. */
	endToEnd: Rate;
}

/**
 * **The gate curve** (`104-…` §4.2): at each threshold, what a gate reading
 * this reader would do. An answer passes at or above the threshold; `null`
 * never passes a threshold above 0; a steer at or above one half is reviewed
 * at any threshold above 0, as the gate reviews it.
 */
export function gateCurve(
	answers: readonly CalibratedAnswer[],
	thresholds: readonly number[] = GATE_THRESHOLDS
): GatePoint[] {
	const n = answers.length;
	return thresholds.map((threshold) => {
		const passes = answers.filter((answer) => {
			if (threshold <= 0) return true;
			if (answer.steer !== undefined && answer.steer >= 0.5) return false;
			return answer.confidence !== null && answer.confidence >= threshold;
		});
		const right = passes.filter((answer) => answer.choice === answer.label).length;
		return {
			threshold,
			reviewed: rateOf(n - passes.length, n),
			residualAccuracy: rateOf(right, passes.length),
			endToEnd: rateOf(right + (n - passes.length), n)
		};
	});
}
