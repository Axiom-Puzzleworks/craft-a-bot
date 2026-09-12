import { wilson, type Interval } from './intervals.js';

/**
 * **The confusion rates** (WP76, `68-METRICS.md` §1 item 2; `65-…` WP76's
 * DoD): precision, recall, F1 and the false-positive rate over a
 * confusion matrix, each with its Wilson band — the same arithmetic
 * `@craftabot/evals`'s `derivedOf` folds for a labelled evaluator, so the
 * Fraud Desk's numbers and the package's are one number (the fraud
 * campaign test asserts it).
 */
export interface ConfusionCounts {
	tp: number;
	fp: number;
	tn: number;
	fn: number;
}

export interface ConfusionRate {
	value: number;
	interval: Interval;
	/** The denominator the rate rests on. */
	n: number;
	method: string;
}

export interface ConfusionRates {
	precision: ConfusionRate;
	recall: ConfusionRate;
	f1: ConfusionRate;
	falsePositiveRate: ConfusionRate;
}

const rate = (k: number, n: number, confidence: number, method = 'wilson'): ConfusionRate => ({
	value: n === 0 ? 0 : k / n,
	interval: wilson(k, n, confidence),
	n,
	method
});

export function confusionRates(counts: ConfusionCounts, confidence = 0.95): ConfusionRates {
	const precision = rate(counts.tp, counts.tp + counts.fp, confidence);
	const recall = rate(counts.tp, counts.tp + counts.fn, confidence);
	const f1 =
		precision.value + recall.value === 0
			? 0
			: (2 * precision.value * recall.value) / (precision.value + recall.value);
	// F1's band: the harmonic mean of the two bands' ends, a stated approximation rather than an interval with a coverage claim.
	const ends = (a: number, b: number) => (a + b === 0 ? 0 : (2 * a * b) / (a + b));
	return {
		precision,
		recall,
		f1: {
			value: f1,
			interval: [
				ends(precision.interval[0], recall.interval[0]),
				ends(precision.interval[1], recall.interval[1])
			],
			n: Math.min(precision.n, recall.n),
			method: 'harmonic mean of the wilson bands’ ends (an approximation, no coverage claim)'
		},
		falsePositiveRate: rate(counts.fp, counts.fp + counts.tn, confidence)
	};
}
