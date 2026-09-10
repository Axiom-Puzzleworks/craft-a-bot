import type { DecidedCase, Decision, FlipCase } from '../fairness.js';
import type { TouchedCase } from '../human-load.js';
import { gaussian, mulberry32 } from '../random.js';

/**
 * **The validation generators** (WP76, `68-METRICS.md` §4): seeded rows
 * with a known shape — a planted effect of a stated size, or a null with
 * none — that the metrics must recover or must not flag. Every generator
 * takes a seed and a size and is deterministic; the suite records both.
 */
export interface CaseShape {
	/** The per-group approval rate; a case's group is drawn uniformly from the keys. */
	approve: Record<string, number>;
	/** The share of decisions that are referrals rather than declines, among the not-approved. Default 0.1. */
	refer?: number;
	/** P(repaid), overall (`repaidGiven` overrides). Default 0.85. */
	repaid?: number;
	/** P(repaid | group, approved) when the repayment rate is what varies. */
	repaidGiven?: (group: string, approved: boolean) => number;
	/** P(approve | group, repaid) when approval among the repaid or the defaulted is what varies. */
	approveGiven?: (group: string, repaid: boolean) => number;
	/** P(decision = verdict | group). Default 0.9. */
	agreement?: Record<string, number>;
	/** Strata and their weights; a case's approval rate may depend on its stratum through `strataShift`. */
	strata?: Record<string, number>;
	/** Added to the approval rate per stratum. */
	strataShift?: Record<string, number>;
}

const pickWeighted = (random: () => number, weights: Record<string, number>): string => {
	const entries = Object.entries(weights);
	const total = entries.reduce((sum, [, w]) => sum + w, 0);
	let at = random() * total;
	for (const [key, w] of entries) {
		at -= w;
		if (at < 0) return key;
	}
	return entries[entries.length - 1]![0];
};

const other = (decision: Decision): Decision => (decision === 'approve' ? 'decline' : 'approve');

export function decidedCases(seed: number, n: number, shape: CaseShape): DecidedCase[] {
	const random = mulberry32(seed);
	const groups = Object.keys(shape.approve);
	const out: DecidedCase[] = [];
	for (let i = 0; i < n; i += 1) {
		const group = groups[Math.floor(random() * groups.length)]!;
		const stratum = shape.strata ? pickWeighted(random, shape.strata) : undefined;
		const repaid = random() < (shape.repaid ?? 0.85);
		let approveRate = shape.approve[group]!;
		if (shape.approveGiven) approveRate = shape.approveGiven(group, repaid);
		if (stratum !== undefined && shape.strataShift) approveRate += shape.strataShift[stratum] ?? 0;
		const approvedNow = random() < approveRate;
		const decision: Decision = approvedNow
			? 'approve'
			: random() < (shape.refer ?? 0.1)
				? 'refer'
				: 'decline';
		const repaidFinal = shape.repaidGiven
			? random() < shape.repaidGiven(group, approvedNow)
			: repaid;
		const agrees = random() < (shape.agreement?.[group] ?? 0.9);
		const verdict = agrees ? decision : other(decision);
		out.push({
			group,
			decision,
			verdict,
			repaid: repaidFinal,
			...(stratum !== undefined ? { stratum } : {})
		});
	}
	return out;
}

/** Matched pairs: `pairs` pairs of (a, b); a share `discordant` decided differently, all favouring side a. */
export function matchedPairs(seed: number, pairs: number, discordant: number): DecidedCase[] {
	const random = mulberry32(seed);
	const out: DecidedCase[] = [];
	for (let i = 0; i < pairs; i += 1) {
		const base: Decision = random() < 0.6 ? 'approve' : 'decline';
		const differ = random() < discordant;
		const a: Decision = differ ? 'approve' : base;
		const b: Decision = differ ? 'decline' : base;
		out.push(
			{ group: 'a', decision: a, pairId: `p${i}` },
			{ group: 'b', decision: b, pairId: `p${i}` }
		);
	}
	return out;
}

export function flips(seed: number, n: number, rate: number): FlipCase[] {
	const random = mulberry32(seed);
	return Array.from({ length: n }, () => {
		const original: Decision = random() < 0.6 ? 'approve' : 'decline';
		return { original, flipped: random() < rate ? other(original) : original };
	});
}

/** A numeric feature: standard normal, shifted by `shift` standard deviations. */
export function feature(seed: number, n: number, shift = 0): number[] {
	const random = mulberry32(seed);
	return Array.from({ length: n }, () => gaussian(random) + shift);
}

/** The feature with a share of its bottom decile's mass moved to the top: the PSI planted effect. */
export function featureWithMovedDecile(seed: number, n: number, moved = 0.8): number[] {
	const random = mulberry32(seed);
	const values = Array.from({ length: n }, () => gaussian(random));
	const sorted = [...values].sort((a, b) => a - b);
	const p10 = sorted[Math.floor(n / 10)] ?? 0;
	return values.map((v) => (v < p10 && random() < moved ? 10 : v));
}

/** A daily rate series of `days`: a flat `level` with noise `sigma`, plus `ramp` per day. */
export function series(
	seed: number,
	days: number,
	level: number,
	sigma: number,
	ramp = 0
): number[] {
	const random = mulberry32(seed);
	return Array.from({ length: days }, (_, day) => level + ramp * day + sigma * gaussian(random));
}

/** Decisions as strings for the outcome-mix distance. */
export function decisions(seed: number, n: number, approve: number): string[] {
	const random = mulberry32(seed);
	return Array.from({ length: n }, () => (random() < approve ? 'approve' : 'decline'));
}

/** Poisson draws by inversion. */
function poisson(random: () => number, mean: number): number {
	const limit = Math.exp(-mean);
	let k = 0;
	let p = 1;
	do {
		k += 1;
		p *= random();
	} while (p > limit);
	return k - 1;
}

/** Cases with Poisson(`meanTouches`) touches and one decision each at `level`, of a kind whose ceiling the caller sets; `breach` decisions per case are at level 5. */
export function touchedCases(
	seed: number,
	n: number,
	meanTouches: number,
	options: { breach?: number; level?: 1 | 2 | 3 | 4 | 5 } = {}
): TouchedCase[] {
	const random = mulberry32(seed);
	const kinds = ['four-eyes', 'returned', 'vulnerability'];
	return Array.from({ length: n }, (_, i) => {
		const count = poisson(random, meanTouches);
		const breached = random() < (options.breach ?? 0);
		return {
			id: `c${i}`,
			touches: Array.from({ length: count }, (__, j) => ({ kind: kinds[j % kinds.length]! })),
			decisions: [{ kind: 'decline', level: breached ? 5 : (options.level ?? 3) }]
		};
	});
}
