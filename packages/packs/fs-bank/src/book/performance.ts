import type { BureauFile } from '../model.js';

/**
 * **The performance label** (WP75, `67-PERFORMANCE-AND-BOOKS.md` §3; `64-…`
 * §6.1.4, decision D6): whether a loan *would* have defaulted within
 * twelve months, drawn for every application — declines included — from
 * a stated hazard over the affordability ratio and the bureau file.
 * A function, not a fact: `hazard` carries the probability the draw was
 * made from and `basis` names the function, so every screen can say
 * *synthetic hazard*. Never fitted, never read by a desk, never shown to a
 * bot (tenet 23).
 */
export interface PerformanceLabel {
	defaultedWithin12m: boolean;
	/** The probability the draw was made from. */
	hazard: number;
	basis: 'synthetic-hazard-v1';
}

/** What the hazard reads of a verdict: the affordability ratio the rule computed. */
export interface HazardInput {
	ratioPercent: number;
}

/** The coefficients, as `67-…` §3 states them. */
export const HAZARD_V1 = {
	intercept: -3.6,
	perRatioPointAbove30: 0.022,
	ratioCap: 120,
	fair: 0.7,
	poor: 1.5,
	perDefault: 0.6,
	defaultsCap: 3,
	perArrearsMonth: 0.25,
	arrearsCap: 6,
	searchesAtLeast3: 0.3
} as const;

/** The twelve-month default probability the hazard gives a file at a ratio. */
export function hazardOf(verdict: HazardInput, bureau: BureauFile): number {
	const c = HAZARD_V1;
	const ratio = Math.min(c.ratioCap, Math.max(0, verdict.ratioPercent));
	let z = c.intercept + c.perRatioPointAbove30 * Math.max(0, ratio - 30);
	if (bureau.scoreBand === 'fair') z += c.fair;
	if (bureau.scoreBand === 'poor') z += c.poor;
	z += c.perDefault * Math.min(c.defaultsCap, bureau.defaults);
	z += c.perArrearsMonth * Math.min(c.arrearsCap, bureau.arrearsMonths);
	if (bureau.searchesLast12m >= 3) z += c.searchesAtLeast3;
	return 1 / (1 + Math.exp(-z));
}

/** One draw from the hazard: `random() < p`. */
export function performanceLabel(
	random: () => number,
	verdict: HazardInput,
	bureau: BureauFile
): PerformanceLabel {
	const hazard = hazardOf(verdict, bureau);
	return {
		defaultedWithin12m: random() < hazard,
		hazard: Math.round(hazard * 10_000) / 10_000,
		basis: 'synthetic-hazard-v1'
	};
}
