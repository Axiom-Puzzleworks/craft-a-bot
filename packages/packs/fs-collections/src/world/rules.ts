/**
 * **The bank's forbearance rule** (WP105, `91-FS-COLLECTIONS.md` §2): CONC
 * 7-shaped and synthetic — the plan an offer is scored against. A rule, not
 * a model: a disclosed support need gets breathing space; a customer who
 * can carry the repayment and clear the arrears over six months gets a
 * payment plan; one who can carry at least half the repayment gets reduced
 * payments; the rest are referred to debt advice. A default notice is never
 * the rule's answer — it is a person's (ceiling 2). Pure, so every test, the
 * Playground and the desk's truth call the same function.
 */
export type Disclosure = 'job-loss' | 'bereavement' | 'health' | 'none';
export const DISCLOSURES: readonly Disclosure[] = ['job-loss', 'bereavement', 'health', 'none'];

export type Plan = 'payment-plan' | 'reduced-payments' | 'breathing-space';
export const PLANS: readonly Plan[] = ['payment-plan', 'reduced-payments', 'breathing-space'];

/** What the rule can say: one of the plans, or a referral to debt advice when none fits. */
export type Outcome = Plan | 'refer';

export type ReasonCode =
	| 'disclosure-recorded'
	| 'arrears-affordable'
	| 'repayment-partly-affordable'
	| 'nothing-affordable';

/** What each reason rests on: what must be on the desk before an offer may cite it. */
export type Evidence = 'circumstances' | 'affordability';

export const REASON_CODES: Readonly<Record<ReasonCode, { needs: Evidence; plain: string }>> = {
	'disclosure-recorded': {
		needs: 'circumstances',
		plain: 'the customer has disclosed a support need, and breathing space is the response'
	},
	'arrears-affordable': {
		needs: 'affordability',
		plain: 'the repayment and the arrears over six months fit within what the customer can afford'
	},
	'repayment-partly-affordable': {
		needs: 'affordability',
		plain: 'at least half the repayment fits within what the customer can afford'
	},
	'nothing-affordable': {
		needs: 'affordability',
		plain: 'less than half the repayment fits; the case goes to debt advice'
	}
};

export const isReasonCode = (value: unknown): value is ReasonCode =>
	typeof value === 'string' && value in REASON_CODES;

/** The months a payment plan spreads the arrears over. */
export const PLAN_MONTHS = 6;
/** Breathing space, in days — the response to a disclosed support need. */
export const BREATHING_SPACE_DAYS = 60;

export interface RuleFigures {
	/** What the customer can put to the loan each month, after the reassessment. */
	disposable: number;
	monthlyRepayment: number;
	arrears: number;
	disclosure: Disclosure;
}

export interface Verdict {
	verdict: Outcome;
	reasons: ReasonCode[];
	/** What the plan asks each month; zero for breathing space and a referral. */
	monthly: number;
}

export function verdictFromFigures(figures: RuleFigures): Verdict {
	if (figures.disclosure !== 'none')
		return { verdict: 'breathing-space', reasons: ['disclosure-recorded'], monthly: 0 };
	const withArrears = figures.monthlyRepayment + figures.arrears / PLAN_MONTHS;
	if (figures.disposable >= withArrears)
		return {
			verdict: 'payment-plan',
			reasons: ['arrears-affordable'],
			monthly: Math.round(withArrears)
		};
	if (figures.disposable >= figures.monthlyRepayment / 2)
		return {
			verdict: 'reduced-payments',
			reasons: ['repayment-partly-affordable'],
			monthly: Math.round(figures.monthlyRepayment / 2)
		};
	return { verdict: 'refer', reasons: ['nothing-affordable'], monthly: 0 };
}

/** The disclosure a customer's words carry — what the rule-executed circumstances stage reads off the case. */
export function disclosureIn(text: string): Disclosure {
	const lower = text.toLowerCase();
	if (/lost my job|made redundant|redundancy|out of work|laid off/.test(lower)) return 'job-loss';
	if (/passed away|bereave|died|funeral/.test(lower)) return 'bereavement';
	if (/health|diagnos|hospital|condition|\billness\b|\bill\b|\bunwell\b/.test(lower))
		return 'health';
	return 'none';
}
