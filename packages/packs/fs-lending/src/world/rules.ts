import type { BureauFile } from '@craftabot/pack-fs-bank';
import { z } from 'zod';

/**
 * **The bank's lending rule** (WP63, `52-FS-LENDING.md` §4.2): the verdict
 * a decision is scored against. A rule, not a model — one synthetic flat
 * rate, one repayment formula, one ratio, and a closed list of reason
 * codes each tied to the evidence a decision must have had in hand. Pure,
 * so every test and the Playground call the same function truth does.
 */
export type Outcome = 'approve' | 'decline' | 'refer';
export const OUTCOMES: readonly Outcome[] = ['approve', 'decline', 'refer'];

/**
 * **The lending knobs** (WP78, `64-TARGET-DESIGN-V5.md` §6.6.2; retires G50):
 * the rule's thresholds as a policy the desk, the truth, the book's verdicts
 * and the policy cards all read from one place — `extra.config.knobs`, set
 * at `create` by a campaign build's `overrides.knobs`, a workflow's
 * `WorkflowConfig.knobs` or a host. The defaults are today's constants, so
 * `DEFAULT_LENDING_POLICY` reproduces every test, the golden trace and the
 * baseline byte for byte (`knobs.test.ts`). One rule with knobs; still no
 * scorecard, nothing fitted (`52-…` §7).
 */
export const lendingPolicySchema = z.object({
	/** The synthetic flat rate, basis points per year. */
	rateBps: z.number().int().min(0).max(10_000).default(790),
	/** Refer when the repayment-to-disposable ratio sits above this. */
	referRatioPercent: z.number().int().min(0).max(999).default(60),
	/** Decline when the ratio sits above this. */
	declineRatioPercent: z.number().int().min(0).max(999).default(100),
	/** Decline at this many bureau defaults; one fewer refers. */
	declineOnDefaults: z.number().int().min(1).default(2),
	/** Refer at this many searches in twelve months. */
	referOnSearches: z.number().int().min(1).default(3),
	/** Refer a `fair` score band. */
	referOnFair: z.boolean().default(true),
	/** Which decisions a person confirms: the payout after an approve, every decision, or none. */
	fourEyes: z.enum(['approve', 'all', 'none']).default('approve'),
	/** When a payslip must be on the desk before a decision. */
	documentBefore: z.enum(['never', 'refer', 'always']).default('never')
});
export type LendingPolicy = z.infer<typeof lendingPolicySchema>;
export const DEFAULT_LENDING_POLICY: LendingPolicy = lendingPolicySchema.parse({});
export const LENDING_KNOB_IDS: readonly string[] = Object.keys(lendingPolicySchema.shape);

/**
 * The policy a config's `knobs` names: the defaults under whatever the knobs
 * set. Keys the schema does not know are ignored (another desk's knobs may
 * share the object); a value of the wrong shape throws, because a campaign
 * that misspells a threshold must not run silently on the default.
 */
export function lendingPolicyFrom(knobs: unknown): LendingPolicy {
	if (knobs === undefined || knobs === null) return DEFAULT_LENDING_POLICY;
	if (typeof knobs !== 'object') throw new Error('lending knobs must be an object');
	const parsed = lendingPolicySchema.safeParse(knobs);
	if (!parsed.success) {
		throw new Error(
			`lending knobs: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`
		);
	}
	return parsed.data;
}

/** The synthetic flat rate, per year — the default policy's. */
export const LENDING_RATE = DEFAULT_LENDING_POLICY.rateBps / 10_000;

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

export function monthlyRepaymentWith(
	policy: LendingPolicy
): (amount: number, termMonths: number) => number {
	const rate = policy.rateBps / 10_000;
	return (amount, termMonths) => Math.round((amount * (1 + (rate * termMonths) / 12)) / termMonths);
}

export const monthlyRepayment = monthlyRepaymentWith(DEFAULT_LENDING_POLICY);

export interface Verdict {
	verdict: Outcome;
	/** Repayment over disposable income, as a percentage rounded down. */
	ratioPercent: number;
	repayment: number;
	reasons: ReasonCode[];
}

/**
 * Decline when the score is poor, defaults reach the decline count, or the
 * ratio sits above the decline ratio; refer when the score is fair (if the
 * policy says so), there is a default short of the decline count, arrears,
 * the search count, or the ratio sits above the refer ratio; approve
 * otherwise. The reasons are the codes that carried the verdict. With the
 * default policy this is the rule as WP63 wrote it, to the digit.
 */
export function affordabilityVerdictWith(
	policy: LendingPolicy
): (application: Application, bureau: BureauFile) => Verdict {
	const repaymentOf = monthlyRepaymentWith(policy);
	return (application, bureau) => {
		const repayment = repaymentOf(application.amount, application.termMonths);
		const disposable = Math.max(0, bureau.affordability.disposable);
		const ratioPercent = disposable === 0 ? 999 : Math.floor((repayment / disposable) * 100);
		const reasons: ReasonCode[] = [];
		if (bureau.scoreBand === 'poor') reasons.push('score-poor');
		if (bureau.defaults >= policy.declineOnDefaults) reasons.push('defaults');
		if (ratioPercent > policy.declineRatioPercent) reasons.push('disposable-low');
		if (reasons.length > 0) return { verdict: 'decline', ratioPercent, repayment, reasons };
		if (bureau.defaults >= 1) reasons.push('defaults');
		if (bureau.arrearsMonths > 0) reasons.push('arrears');
		if (bureau.searchesLast12m >= policy.referOnSearches) reasons.push('searches');
		if (ratioPercent > policy.referRatioPercent) reasons.push('commitments-high');
		if (reasons.length > 0 || (policy.referOnFair && bureau.scoreBand === 'fair'))
			return {
				verdict: 'refer',
				ratioPercent,
				repayment,
				reasons: [...reasons, 'rules-cannot-decide']
			};
		return { verdict: 'approve', ratioPercent, repayment, reasons: ['affordable'] };
	};
}

export const affordabilityVerdict = affordabilityVerdictWith(DEFAULT_LENDING_POLICY);
