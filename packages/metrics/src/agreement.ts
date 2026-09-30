import { normalQuantile } from './normal.js';
import type { Interval } from './intervals.js';

/**
 * **Agreement between two labellers** (WP119, `105-CORPORA.md` §6): Cohen's
 * κ over the rows both labelled — (p_o − p_e) / (1 − p_e), where p_o is the
 * share they agree on and p_e the share two labellers with their own label
 * frequencies would agree on by chance. 1 is full agreement, 0 is chance.
 * The interval is the large-sample one, p_o(1 − p_o) / (n(1 − p_e)²) as the
 * variance, clamped to [−1, 1]. When both labellers give one label to every
 * row, p_e is 1 and κ is 1 if they agree and 0 if they do not.
 */
export interface KappaResult {
	metric: 'cohens-kappa';
	value: number;
	interval: Interval;
	n: number;
	/** The share of rows they agree on. */
	observed: number;
	/** The share two labellers with their frequencies would agree on by chance. */
	chance: number;
	/** The rows they disagree on, by index. */
	disagreements: number[];
}

export function cohensKappa(
	first: readonly string[],
	second: readonly string[],
	confidence = 0.95
): KappaResult {
	if (first.length !== second.length)
		throw new Error(`κ needs the same rows from both: ${first.length} and ${second.length}`);
	const n = first.length;
	const disagreements: number[] = [];
	const countA = new Map<string, number>();
	const countB = new Map<string, number>();
	for (let i = 0; i < n; i += 1) {
		const a = first[i]!;
		const b = second[i]!;
		if (a !== b) disagreements.push(i);
		countA.set(a, (countA.get(a) ?? 0) + 1);
		countB.set(b, (countB.get(b) ?? 0) + 1);
	}
	if (n === 0)
		return {
			metric: 'cohens-kappa',
			value: 0,
			interval: [-1, 1],
			n,
			observed: 0,
			chance: 0,
			disagreements
		};
	const observed = (n - disagreements.length) / n;
	let chance = 0;
	for (const [label, count] of countA) chance += (count / n) * ((countB.get(label) ?? 0) / n);
	if (chance >= 1) {
		const value = observed === 1 ? 1 : 0;
		return {
			metric: 'cohens-kappa',
			value,
			interval: [value, value],
			n,
			observed,
			chance,
			disagreements
		};
	}
	const value = (observed - chance) / (1 - chance);
	const z = normalQuantile(1 - (1 - confidence) / 2);
	const se = Math.sqrt((observed * (1 - observed)) / (n * (1 - chance) ** 2));
	return {
		metric: 'cohens-kappa',
		value,
		interval: [Math.max(-1, value - z * se), Math.min(1, value + z * se)],
		n,
		observed,
		chance,
		disagreements
	};
}
