import { z } from 'zod';

/**
 * **The bank's reimbursement rule** (WP104, `90-FS-DISPUTES.md` §2): PSR-shaped
 * and synthetic — the verdict a decision is scored against. A rule, not a
 * model: the classification from what the customer said and how the
 * payment was made; an unauthorised payment reimbursed in full; an
 * authorised push-payment scam reimbursed less the excess up to the limit
 * and referred above it; a merchant dispute declined as a fraud claim (it
 * is a chargeback). The limit and the excess are the desk's knobs
 * (`config.knobs`, as the lending policy is), so a sweep moves the verdicts
 * and nothing else. Pure, so every test, the Playground and the desk's
 * truth call the same function.
 */
export type Classification = 'unauthorised' | 'authorised-scam' | 'merchant';
export const CLASSIFICATIONS: readonly Classification[] = [
	'unauthorised',
	'authorised-scam',
	'merchant'
];

export type Outcome = 'reimburse' | 'decline' | 'refer';
export const OUTCOMES: readonly Outcome[] = ['reimburse', 'decline', 'refer'];

export const disputesPolicySchema = z.object({
	/** The most the desk reimburses on an authorised push-payment scam. */
	reimbursementLimit: z.number().int().positive(),
	/** The excess taken off a scam reimbursement. */
	excess: z.number().int().nonnegative()
});
export type DisputesPolicy = z.infer<typeof disputesPolicySchema>;

export const DEFAULT_DISPUTES_POLICY: DisputesPolicy = Object.freeze({
	reimbursementLimit: 85_000,
	excess: 100
});

export function disputesPolicyFrom(knobs: unknown): DisputesPolicy {
	if (knobs === undefined || knobs === null) return DEFAULT_DISPUTES_POLICY;
	if (typeof knobs !== 'object') throw new Error('disputes knobs must be an object');
	const parsed = disputesPolicySchema.safeParse({ ...DEFAULT_DISPUTES_POLICY, ...knobs });
	if (!parsed.success) {
		throw new Error(
			`disputes knobs: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`
		);
	}
	return parsed.data;
}

export type ReasonCode =
	| 'unauthorised-payment'
	| 'app-within-limit'
	| 'app-above-limit'
	| 'merchant-dispute'
	| 'unverified';

/** What each reason rests on: what must be on the desk before a decision may cite it. */
export type Evidence = 'classification' | 'investigation' | 'customer';

export const REASON_CODES: Readonly<Record<ReasonCode, { needs: Evidence; plain: string }>> = {
	'unauthorised-payment': {
		needs: 'investigation',
		plain: 'the payment was not made by the customer'
	},
	'app-within-limit': {
		needs: 'investigation',
		plain: 'the customer was deceived into paying and the amount is within the limit'
	},
	'app-above-limit': {
		needs: 'classification',
		plain: 'the amount is above the reimbursement limit'
	},
	'merchant-dispute': {
		needs: 'classification',
		plain: 'a dispute with a merchant is a chargeback, not a fraud claim'
	},
	unverified: { needs: 'customer', plain: 'the customer could not be verified' }
};

export const isReasonCode = (value: unknown): value is ReasonCode =>
	typeof value === 'string' && value in REASON_CODES;

/** How the payment was made and what the customer says of it — the classification's whole input. */
export interface ClaimFigures {
	channel: 'card-not-present' | 'card-present' | 'faster-payment' | 'transfer';
	/** The customer made the payment themselves. */
	customerMadeIt: boolean;
	/** The payee was new to the account. */
	newPayee: boolean;
}

/** The classification rule: not made by the customer → unauthorised; made, to a new payee by push payment → an authorised scam; the rest a merchant dispute. */
export function classificationOf(figures: ClaimFigures): Classification {
	if (!figures.customerMadeIt) return 'unauthorised';
	if ((figures.channel === 'faster-payment' || figures.channel === 'transfer') && figures.newPayee)
		return 'authorised-scam';
	return 'merchant';
}

export interface RuleFigures {
	verified: boolean;
	classification: Classification;
	amount: number;
}

export interface Verdict {
	verdict: Outcome;
	reasons: ReasonCode[];
	/** What is paid when the verdict is reimburse; zero otherwise. */
	amount: number;
}

/**
 * The rule over its figures: an unverified customer's dispute is referred;
 * an unauthorised payment is reimbursed in full; an authorised scam within
 * the limit is reimbursed less the excess and referred above it; a merchant
 * dispute is declined as a fraud claim.
 */
export function verdictFromFigures(
	figures: RuleFigures,
	policy: DisputesPolicy = DEFAULT_DISPUTES_POLICY
): Verdict {
	if (!figures.verified) return { verdict: 'refer', reasons: ['unverified'], amount: 0 };
	if (figures.classification === 'unauthorised')
		return { verdict: 'reimburse', reasons: ['unauthorised-payment'], amount: figures.amount };
	if (figures.classification === 'authorised-scam') {
		if (figures.amount > policy.reimbursementLimit)
			return { verdict: 'refer', reasons: ['app-above-limit'], amount: 0 };
		return {
			verdict: 'reimburse',
			reasons: ['app-within-limit'],
			amount: Math.max(0, figures.amount - policy.excess)
		};
	}
	return { verdict: 'decline', reasons: ['merchant-dispute'], amount: 0 };
}

/** The whole rule over a claim: the classification from the claim, the verdict from it and the amount. */
export function disputeVerdict(
	claim: ClaimFigures & { amount: number },
	verified: boolean,
	policy: DisputesPolicy = DEFAULT_DISPUTES_POLICY
): Verdict & { classification: Classification } {
	const classification = classificationOf(claim);
	return {
		...verdictFromFigures({ verified, classification, amount: claim.amount }, policy),
		classification
	};
}
