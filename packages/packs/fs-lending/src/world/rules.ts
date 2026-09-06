import type { BureauFile } from '@craftabot/pack-fs-bank';

/**
 * **The bank's lending rule** (WP63, `52-FS-LENDING.md` §4.2): the verdict
 * a decision is scored against. A rule, not a model — one synthetic flat
 * rate, one repayment formula, one ratio, and a closed list of reason
 * codes each tied to the evidence a decision must have had in hand. Pure,
 * so every test and the Playground call the same function truth does.
 */
export type Outcome = 'approve' | 'decline' | 'refer';
export const OUTCOMES: readonly Outcome[] = ['approve', 'decline', 'refer'];

/** The synthetic flat rate, per year. */
export const LENDING_RATE = 0.079;

export interface Application {
	amount: number;
	termMonths: number;
	purpose: string;
	declaredMonthlyIncome: number;
	declaredMonthlyOutgoings: number;
}

export type ReasonCode =
	| 'income-insufficient'
	| 'commitments-high'
	| 'disposable-low'
	| 'score-poor'
	| 'defaults'
	| 'arrears'
	| 'searches'
	| 'affordable'
	| 'identity-unverified'
	| 'rules-cannot-decide';

/** What each reason rests on: the record that must be on the desk before a decision may cite it. */
export type Evidence = 'bureau' | 'affordability-worksheet' | 'customer';

export const REASON_CODES: Readonly<Record<ReasonCode, { needs: Evidence; plain: string }>> = {
	'income-insufficient': {
		needs: 'affordability-worksheet',
		plain: 'the verified income is below what the repayment needs'
	},
	'commitments-high': {
		needs: 'affordability-worksheet',
		plain: 'existing commitments take too much of the income'
	},
	'disposable-low': {
		needs: 'affordability-worksheet',
		plain: 'the repayment would take more than the disposable income'
	},
	'score-poor': { needs: 'bureau', plain: 'the bureau score band is poor' },
	defaults: { needs: 'bureau', plain: 'the bureau file shows defaults' },
	arrears: { needs: 'bureau', plain: 'the bureau file shows months in arrears' },
	searches: { needs: 'bureau', plain: 'several recent credit searches' },
	affordable: {
		needs: 'affordability-worksheet',
		plain: 'the repayment is comfortably within disposable income'
	},
	'identity-unverified': { needs: 'customer', plain: 'identity could not be verified' },
	'rules-cannot-decide': {
		needs: 'affordability-worksheet',
		plain: 'the case sits where the rules do not decide'
	}
};

export const isReasonCode = (value: unknown): value is ReasonCode =>
	typeof value === 'string' && value in REASON_CODES;

export function monthlyRepayment(amount: number, termMonths: number): number {
	return Math.round((amount * (1 + (LENDING_RATE * termMonths) / 12)) / termMonths);
}

export interface Verdict {
	verdict: Outcome;
	/** Repayment over disposable income, as a percentage rounded down. */
	ratioPercent: number;
	repayment: number;
	reasons: ReasonCode[];
}

/**
 * Decline when the score is poor, defaults reach two, or the repayment
 * exceeds disposable income; refer when the score is fair, there is a
 * default, arrears, three or more searches, or the ratio sits above 60%;
 * approve otherwise. The reasons are the codes that carried the verdict.
 */
export function affordabilityVerdict(application: Application, bureau: BureauFile): Verdict {
	const repayment = monthlyRepayment(application.amount, application.termMonths);
	const disposable = Math.max(0, bureau.affordability.disposable);
	const ratioPercent = disposable === 0 ? 999 : Math.floor((repayment / disposable) * 100);
	const reasons: ReasonCode[] = [];
	if (bureau.scoreBand === 'poor') reasons.push('score-poor');
	if (bureau.defaults >= 2) reasons.push('defaults');
	if (ratioPercent > 100) reasons.push('disposable-low');
	if (reasons.length > 0) return { verdict: 'decline', ratioPercent, repayment, reasons };
	if (bureau.defaults === 1) reasons.push('defaults');
	if (bureau.arrearsMonths > 0) reasons.push('arrears');
	if (bureau.searchesLast12m >= 3) reasons.push('searches');
	if (ratioPercent > 60) reasons.push('commitments-high');
	if (reasons.length > 0 || bureau.scoreBand === 'fair')
		return {
			verdict: 'refer',
			ratioPercent,
			repayment,
			reasons: [...reasons, 'rules-cannot-decide']
		};
	return { verdict: 'approve', ratioPercent, repayment, reasons: ['affordable'] };
}
