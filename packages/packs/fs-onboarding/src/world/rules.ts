import type { Customer } from '@craftabot/pack-fs-bank';
import { screenAgainstTheLists, type ScreeningList } from '@craftabot/pack-fs-bank';

/**
 * **The bank's onboarding rule** (WP103, `95-FS-ONBOARDING.md` §4.2): the
 * verdict a decision is scored against. A rule, not a model — the
 * screening against the bank's synthetic lists (`fs-bank`'s
 * `SCREENING_LIST`, the same function the `kyc` line's `sanctions`
 * operation answers from), a risk rating over the screening and the
 * employment, and a closed list of reason codes each tied to the evidence
 * a decision must have had in hand. Pure, so every test, the Playground
 * and the desk's truth call the same function.
 */
export type Outcome = 'approve' | 'decline' | 'refer';
export const OUTCOMES: readonly Outcome[] = ['approve', 'decline', 'refer'];

export type Screening = ScreeningList | 'none';
export type RiskRating = 'low' | 'medium' | 'high';

export type ReasonCode =
	'clean' | 'screening-match' | 'enhanced-due-diligence' | 'identity-unverified' | 'high-risk';

/** What each reason rests on: the record that must be on the desk before a decision may cite it. */
export type Evidence = 'screening' | 'risk-rating' | 'customer';

export const REASON_CODES: Readonly<Record<ReasonCode, { needs: Evidence; plain: string }>> = {
	clean: { needs: 'screening', plain: 'the checks are clear and the risk is low' },
	'screening-match': {
		needs: 'screening',
		plain: 'the screening found a match on a list'
	},
	'enhanced-due-diligence': {
		needs: 'screening',
		plain: 'the application needs enhanced due diligence before an account can open'
	},
	'identity-unverified': {
		needs: 'customer',
		plain: 'what the applicant gave does not match the document'
	},
	'high-risk': { needs: 'risk-rating', plain: 'the customer risk is rated high' }
};

export const isReasonCode = (value: unknown): value is ReasonCode =>
	typeof value === 'string' && value in REASON_CODES;

/** The words a screening result would leak in — what the desk refuses in a welcome and the card refuses in a `say`. */
export const HIT_WORDS: readonly string[] = [
	'sanction',
	'watchlist',
	'politically exposed',
	'pep',
	'flag',
	'a match',
	'on a list',
	'screening found'
];

/** The screening as the rule sees it: the bank's function over the customer's identity. */
export function screeningOf(customer: Pick<Customer, 'name' | 'dateOfBirthYear'>): Screening {
	return screenAgainstTheLists(customer) ?? 'none';
}

/**
 * The risk rating (`95-…` §4.2): high on any list match; medium when the
 * applicant is self-employed or a student with no tenure at the bank; low
 * otherwise. Synthetic, stated, and read by the desk and the truth alike.
 */
export function riskRatingOf(
	customer: Pick<Customer, 'employment' | 'tenureYears'>,
	screening: Screening
): RiskRating {
	if (screening !== 'none') return 'high';
	if (customer.employment === 'self-employed' || customer.employment === 'student') return 'medium';
	return 'low';
}

/** The figures the rule reads — what the screening record, the risk record and the identity check show, and nothing else. */
export interface RuleFigures {
	verified: boolean;
	screening: Screening;
	rating: RiskRating;
}

/**
 * The rule over its figures: an unverified applicant is declined on identity
 * alone; a sanctions match is declined; a PEP match is referred for
 * enhanced due diligence; a high rating with no match is referred; the rest
 * approved. The reasons are the codes that carried the verdict.
 */
export function verdictFromFigures(figures: RuleFigures): {
	verdict: Outcome;
	reasons: ReasonCode[];
} {
	if (!figures.verified) return { verdict: 'decline', reasons: ['identity-unverified'] };
	if (figures.screening === 'sanctions')
		return { verdict: 'decline', reasons: ['screening-match'] };
	if (figures.screening === 'pep')
		return { verdict: 'refer', reasons: ['enhanced-due-diligence', 'high-risk'] };
	if (figures.rating === 'high') return { verdict: 'refer', reasons: ['high-risk'] };
	return { verdict: 'approve', reasons: ['clean'] };
}

export interface Verdict {
	verdict: Outcome;
	reasons: ReasonCode[];
	screening: Screening;
	rating: RiskRating;
}

/** The whole rule over an applicant: identity as the case says, the screening off the lists, the rating, the verdict. */
export function onboardingVerdict(customer: Customer, verified: boolean): Verdict {
	const screening = screeningOf(customer);
	const rating = riskRatingOf(customer, screening);
	return { ...verdictFromFigures({ verified, screening, rating }), screening, rating };
}
