import { clopperPearson, logRatio, newcombe, wilson, type Interval } from './intervals.js';
import { fisherExact, signTest, twoProportionZ } from './tests.js';

/**
 * **Fairness** (WP76, `68-METRICS.md` §3.2; `64-…` §6.4.1): nine metrics
 * over decided cases, each defined once, each returning its value with
 * the *n* it rests on, an interval, the method that made it, whether it
 * is underpowered, and — where one applies — a test's p. The rule judges
 * the decision (`verdict`); the performance label judges the policy
 * (`repaid`); the two never mix in one number (tenet 23).
 */
export type Decision = 'approve' | 'decline' | 'refer';

export interface DecidedCase {
	group: string;
	decision: Decision;
	verdict?: Decision | undefined;
	/** The performance label: the customer would have repaid (`!defaultedWithin12m`). Drawn for declines too. */
	repaid?: boolean | undefined;
	/** A legitimate factor's value — a score band, an income band — for conditional parity. */
	stratum?: string | undefined;
	/** Matched pairs share one id, one case per side. */
	pairId?: string | undefined;
}

export interface FlipCase {
	original: Decision;
	flipped: Decision;
}

export type FairnessMetricId =
	| 'demographic-parity'
	| 'disparate-impact'
	| 'equal-opportunity'
	| 'equalised-odds'
	| 'predictive-parity'
	| 'conditional-parity'
	| 'rule-agreement'
	| 'discordance'
	| 'counterfactual-flip';

export const FAIRNESS_METRIC_IDS: readonly FairnessMetricId[] = [
	'demographic-parity',
	'disparate-impact',
	'equal-opportunity',
	'equalised-odds',
	'predictive-parity',
	'conditional-parity',
	'rule-agreement',
	'discordance',
	'counterfactual-flip'
];

export interface FairnessResult {
	metric: FairnessMetricId;
	value: number;
	/** The groups counted, in the order first seen. */
	groups: string[];
	/** Cases per group that entered the statistic. */
	n: Record<string, number>;
	/** The per-group statistic the value compares. */
	rates: Record<string, number>;
	/** The groups at the two ends of the comparison, when there are two. */
	extremes?: { high: string; low: string } | undefined;
	interval: Interval;
	confidence: number;
	method: string;
	/** True when the smallest group counted has fewer than `floor` cases. */
	underpowered: boolean;
	p?: number | undefined;
	test?: string | undefined;
	/** What the value is made of, for a reader — a stratum's share, a component's name. */
	detail?: Record<string, number | string> | undefined;
}

export interface FairnessOptions {
	confidence?: number;
	/** The smallest group size under which a result is `underpowered`. Default 30. */
	floor?: number;
	/** For `conditional-parity`: the case field the strata come from. Default `stratum`. */
	stratify?: keyof DecidedCase;
}

const DEFAULTS = { confidence: 0.95, floor: 30 };

interface GroupCount {
	k: number;
	n: number;
}

function countBy(
	cases: readonly DecidedCase[],
	include: (c: DecidedCase) => boolean,
	positive: (c: DecidedCase) => boolean
): Map<string, GroupCount> {
	const groups = new Map<string, GroupCount>();
	for (const c of cases) {
		if (!include(c)) continue;
		const entry = groups.get(c.group) ?? { k: 0, n: 0 };
		entry.n += 1;
		if (positive(c)) entry.k += 1;
		groups.set(c.group, entry);
	}
	return groups;
}

function spread(
	metric: FairnessMetricId,
	groups: Map<string, GroupCount>,
	options: FairnessOptions,
	kind: 'difference' | 'ratio'
): FairnessResult {
	const confidence = options.confidence ?? DEFAULTS.confidence;
	const floor = options.floor ?? DEFAULTS.floor;
	const names = [...groups.keys()];
	const n: Record<string, number> = {};
	const rates: Record<string, number> = {};
	for (const [name, count] of groups) {
		n[name] = count.n;
		rates[name] = count.n === 0 ? 0 : count.k / count.n;
	}
	const counted = names.filter((name) => (groups.get(name)?.n ?? 0) > 0);
	const underpowered = counted.length < 2 || counted.some((name) => (n[name] ?? 0) < floor);
	if (counted.length < 2) {
		return {
			metric,
			value: kind === 'ratio' ? 1 : 0,
			groups: names,
			n,
			rates,
			interval: kind === 'ratio' ? [0, Infinity] : [0, 0],
			confidence,
			method: `${kind === 'ratio' ? 'log-ratio' : 'newcombe'}; fewer than two groups counted`,
			underpowered: true
		};
	}
	let high = counted[0]!;
	let low = counted[0]!;
	for (const name of counted) {
		if (rates[name]! > rates[high]!) high = name;
		if (rates[name]! < rates[low]!) low = name;
	}
	const a = groups.get(high)!;
	const b = groups.get(low)!;
	const test =
		a.n < floor || b.n < floor
			? fisherExact(a.k, a.n - a.k, b.k, b.n - b.k)
			: twoProportionZ(a.k, a.n, b.k, b.n);
	if (kind === 'ratio') {
		const ratio = rates[high] === 0 ? 1 : rates[low]! / rates[high]!;
		const { interval, corrected } = logRatio(b.k, b.n, a.k, a.n, confidence);
		return {
			metric,
			value: ratio,
			groups: names,
			n,
			rates,
			extremes: { high, low },
			interval,
			confidence,
			method: `log-ratio${corrected ? ' (Haldane–Anscombe +0.5 on a zero cell)' : ''}; the four-fifths rule (≥ 0.8) is a convention`,
			underpowered,
			p: test.p,
			test: test.test
		};
	}
	return {
		metric,
		value: rates[high]! - rates[low]!,
		groups: names,
		n,
		rates,
		extremes: { high, low },
		interval: newcombe(a.k, a.n, b.k, b.n, confidence),
		confidence,
		method: 'newcombe hybrid score on the difference between the highest and lowest groups',
		underpowered,
		p: test.p,
		test: test.test
	};
}

const approved = (c: DecidedCase) => c.decision === 'approve';

/** max − min over groups of P(approve | group). */
export function demographicParity(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	return spread(
		'demographic-parity',
		countBy(cases, () => true, approved),
		options,
		'difference'
	);
}

/** min / max over groups of P(approve | group). */
export function disparateImpact(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	return spread(
		'disparate-impact',
		countBy(cases, () => true, approved),
		options,
		'ratio'
	);
}

/** max − min of P(approve | repaid, group). */
export function equalOpportunity(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	return spread(
		'equal-opportunity',
		countBy(cases, (c) => c.repaid === true, approved),
		options,
		'difference'
	);
}

/** The larger of the equal-opportunity difference and the false-positive-rate difference (P(approve | defaulted, group)). */
export function equalisedOdds(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	// The larger of two differences: each component at 1 − α/2 (Bonferroni), so the
	// family-wise false-alarm rate stays at α — the null test in the suite proves it.
	const confidence = options.confidence ?? DEFAULTS.confidence;
	const each = { ...options, confidence: 1 - (1 - confidence) / 2 };
	const tpr = spread(
		'equalised-odds',
		countBy(cases, (c) => c.repaid === true, approved),
		each,
		'difference'
	);
	const fpr = spread(
		'equalised-odds',
		countBy(cases, (c) => c.repaid === false, approved),
		each,
		'difference'
	);
	const larger = fpr.value > tpr.value ? fpr : tpr;
	return {
		...larger,
		confidence,
		method: `${larger.method}; the larger of the true-positive-rate and false-positive-rate differences, each at 1 − α/2 (Bonferroni)`,
		underpowered: tpr.underpowered || fpr.underpowered,
		detail: {
			component: larger === fpr ? 'false-positive-rate' : 'true-positive-rate',
			tpr: tpr.value,
			fpr: fpr.value
		}
	};
}

/** max − min of P(repaid | approved, group). */
export function predictiveParity(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	return spread(
		'predictive-parity',
		countBy(
			cases,
			(c) => approved(c) && c.repaid !== undefined,
			(c) => c.repaid === true
		),
		options,
		'difference'
	);
}

/**
 * Demographic parity within strata of a legitimate factor, pooled by
 * stratum weight; the interval is the weighted sum of the strata's bounds
 * (conservative, `68-…` §7). A stratum with fewer than two groups is left
 * out and named in `detail`.
 */
export function conditionalParity(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	const confidence = options.confidence ?? DEFAULTS.confidence;
	const field = options.stratify ?? 'stratum';
	const strata = new Map<string, DecidedCase[]>();
	for (const c of cases) {
		const value = c[field];
		if (value === undefined) continue;
		const key = String(value);
		const list = strata.get(key);
		if (list) list.push(c);
		else strata.set(key, [c]);
	}
	const groups = new Set<string>();
	for (const c of cases) groups.add(c.group);
	let counted = 0;
	let value = 0;
	let lo = 0;
	let hi = 0;
	let underpowered = false;
	const detail: Record<string, number | string> = {};
	const leftOut: string[] = [];
	const perStratum: Array<{ key: string; weight: number; result: FairnessResult }> = [];
	for (const [key, list] of strata) {
		const result = demographicParity(list, options);
		if (result.extremes === undefined) {
			leftOut.push(key);
			continue;
		}
		perStratum.push({ key, weight: list.length, result });
		counted += list.length;
	}
	for (const { key, weight, result } of perStratum) {
		const w = weight / counted;
		value += w * result.value;
		lo += w * result.interval[0];
		hi += w * result.interval[1];
		underpowered ||= result.underpowered;
		detail[`stratum:${key}`] = result.value;
		detail[`weight:${key}`] = w;
	}
	if (leftOut.length > 0) detail['left-out'] = leftOut.join(', ');
	const n: Record<string, number> = {};
	for (const g of groups)
		n[g] = cases.filter((c) => c.group === g && c[field] !== undefined).length;
	return {
		metric: 'conditional-parity',
		value,
		groups: [...groups],
		n,
		rates: {},
		interval: [lo, hi],
		confidence,
		method:
			'demographic parity within strata, pooled by stratum share; the strata’s newcombe bounds summed by weight',
		underpowered: perStratum.length === 0 || underpowered,
		detail
	};
}

/** max − min of P(decision = verdict | group) — the bot's fairness, apart from the policy's. */
export function ruleAgreement(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	return spread(
		'rule-agreement',
		countBy(
			cases,
			(c) => c.verdict !== undefined,
			(c) => c.decision === c.verdict
		),
		options,
		'difference'
	);
}

/** Over pairs sharing a `pairId` with one case per side: the share decided differently, with the sign test on the direction. */
export function matchedPairDiscordance(
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	const confidence = options.confidence ?? DEFAULTS.confidence;
	const floor = options.floor ?? DEFAULTS.floor;
	const pairs = new Map<string, DecidedCase[]>();
	for (const c of cases) {
		if (c.pairId === undefined) continue;
		const list = pairs.get(c.pairId);
		if (list) list.push(c);
		else pairs.set(c.pairId, [c]);
	}
	let counted = 0;
	let discordant = 0;
	let favourFirst = 0;
	const groups: string[] = [];
	for (const pair of pairs.values()) {
		if (pair.length !== 2 || pair[0]!.group === pair[1]!.group) continue;
		const [first, second] = pair as [DecidedCase, DecidedCase];
		for (const c of [first, second]) if (!groups.includes(c.group)) groups.push(c.group);
		counted += 1;
		if (first.decision !== second.decision) {
			discordant += 1;
			if (approved(first) && !approved(second)) favourFirst += 1;
		}
	}
	const test = signTest(favourFirst, discordant);
	return {
		metric: 'discordance',
		value: counted === 0 ? 0 : discordant / counted,
		groups,
		n: { pairs: counted, discordant },
		rates: {},
		interval: clopperPearson(discordant, counted, confidence),
		confidence,
		method: 'clopper–pearson exact on discordant pairs; the sign test on the direction',
		underpowered: counted < floor,
		p: test.p,
		test: test.test,
		detail: { favourFirst, favourSecond: discordant - favourFirst }
	};
}

/** The share of cases whose decision changed when the cohort was flipped and everything else held. */
export function counterfactualFlip(
	flips: readonly FlipCase[],
	options: FairnessOptions = {}
): FairnessResult {
	const confidence = options.confidence ?? DEFAULTS.confidence;
	const floor = options.floor ?? DEFAULTS.floor;
	const changed = flips.filter((f) => f.original !== f.flipped).length;
	return {
		metric: 'counterfactual-flip',
		value: flips.length === 0 ? 0 : changed / flips.length,
		groups: [],
		n: { forks: flips.length, changed },
		rates: {},
		interval: clopperPearson(changed, flips.length, confidence),
		confidence,
		method: 'clopper–pearson exact on flipped forks',
		underpowered: flips.length < floor
	};
}

/** A rate with its Wilson band — the Monitor's readouts (`64-…` §6.5.3) use this. */
export function rateWithBand(
	k: number,
	n: number,
	confidence = 0.95
): { value: number; interval: Interval; n: number; method: string } {
	return { value: n === 0 ? 0 : k / n, interval: wilson(k, n, confidence), n, method: 'wilson' };
}

/** Every §3.2 metric by id, for a caller that names one. */
export function fairnessMetric(
	metric: Exclude<FairnessMetricId, 'counterfactual-flip'>,
	cases: readonly DecidedCase[],
	options: FairnessOptions = {}
): FairnessResult {
	switch (metric) {
		case 'demographic-parity':
			return demographicParity(cases, options);
		case 'disparate-impact':
			return disparateImpact(cases, options);
		case 'equal-opportunity':
			return equalOpportunity(cases, options);
		case 'equalised-odds':
			return equalisedOdds(cases, options);
		case 'predictive-parity':
			return predictiveParity(cases, options);
		case 'conditional-parity':
			return conditionalParity(cases, options);
		case 'rule-agreement':
			return ruleAgreement(cases, options);
		case 'discordance':
			return matchedPairDiscordance(cases, options);
	}
}
