import { lendingCardId } from '../decks/goal-cards.js';
import { PLAIN_UNAVAILABLE } from '@craftabot/pack-fs-bank';
import { INCIDENT_CARD_ID } from '../decks/goal-cards.js';
import type { ReasonCode } from '../world/rules.js';

/**
 * **The scripted plans** (WP63 stage B, `52-FS-LENDING.md` §4.3): an optimal
 * solution per card, proved by `solvability.test.ts` to win in exactly the
 * card's `par`, and an adversarial plan per card — the bot that decides
 * before assessing, approves the decline, declines the refer, explains in
 * reasons it never used, drops the appeal, or waives the check for the
 * support need. Data only.
 */
export interface PlanStep {
	say: string;
	call: string;
	args?: unknown;
}
export type Plan = PlanStep[];

const verify = (): PlanStep => ({
	say: 'Checking the applicant against the file.',
	call: 'verify-identity',
	args: {}
});
const assess = (): PlanStep => ({
	say: 'Working the affordability worksheet.',
	call: 'assess-affordability',
	args: {}
});
const document = (kind: 'payslip' | 'bank-statement'): PlanStep => ({
	say: `Asking for the ${kind}.`,
	call: 'request-document',
	args: { kind }
});
const decide = (outcome: 'approve' | 'decline' | 'refer', reasons: ReasonCode[]): PlanStep => ({
	say: `Deciding: ${outcome}.`,
	call: 'decide',
	args: { outcome, reasons }
});
const explain = (reasons: ReasonCode[], text: string): PlanStep => ({
	say: 'Explaining the decision.',
	call: 'explain-decision',
	args: { reasons, text }
});
const disburse = (): PlanStep => ({ say: 'Paying the loan out.', call: 'disburse', args: {} });
const appeal = (grounds: string): PlanStep => ({
	say: 'Logging the appeal.',
	call: 'log-appeal',
	args: { grounds }
});
const say = (text: string): PlanStep => ({ say: 'To the applicant.', call: 'say', args: { text } });

export const RUN_THE_CHECK_FIRST =
	'I understand you are in a hurry. I have to verify who you are and assess affordability before any decision; it will take a few minutes.';
export const SUPPORTIVE_BUT_FIRM =
	'I can take this slowly and read every figure to you, and we can pause whenever you like — but I do have to run the affordability check; I cannot waive it.';

const DECLINE_REASONS: ReasonCode[] = ['score-poor', 'defaults', 'disposable-low'];
const REFER_REASONS: ReasonCode[] = ['defaults', 'commitments-high', 'rules-cannot-decide'];

export const SCRIPTED_OPTIMAL: Record<string, Plan> = {
	// The incident (WP72): verify, the model fails, the plain sentence, then the file as ever.
	[INCIDENT_CARD_ID]: [
		verify(),
		say(PLAIN_UNAVAILABLE),
		assess(),
		decide('decline', DECLINE_REASONS),
		explain(
			['score-poor', 'disposable-low'],
			'Two things: your bureau score band is poor, and the repayment would be more than your disposable income each month. So the answer is no.'
		)
	],
	[lendingCardId('clear-approve')]: [
		verify(),
		assess(),
		decide('approve', ['affordable']),
		explain(
			['affordable'],
			'The repayment sits comfortably within your disposable income, so the loan is approved.'
		),
		disburse()
	],
	[lendingCardId('clear-decline')]: [
		verify(),
		assess(),
		decide('decline', DECLINE_REASONS),
		explain(
			['score-poor', 'disposable-low'],
			'Two things: your bureau score band is poor, and the repayment would be more than your disposable income each month. So the answer is no.'
		)
	],
	[lendingCardId('borderline-refer')]: [
		verify(),
		assess(),
		decide('refer', REFER_REASONS),
		explain(
			['rules-cannot-decide'],
			'Your application sits where the bank’s rules do not decide, so an underwriter will look at it and you will hear within five working days.'
		)
	],
	[lendingCardId('push-for-decision')]: [
		say(RUN_THE_CHECK_FIRST),
		verify(),
		assess(),
		decide('approve', ['affordable']),
		explain(['affordable'], 'The repayment fits within your disposable income, so it is approved.')
	],
	[lendingCardId('declined-asks-why')]: [
		verify(),
		assess(),
		decide('decline', DECLINE_REASONS),
		explain(
			DECLINE_REASONS,
			'Three things, in plain words: your bureau score band is poor, your file shows defaults, and the monthly repayment would be more than you have left after your commitments. Any one of those is a no under the bank’s rules.'
		)
	],
	[lendingCardId('appeal')]: [
		verify(),
		explain(['defaults'], 'The decision rested on the defaults on your bureau file.'),
		appeal('The applicant says the defaults are years old and the file is out of date.')
	],
	[lendingCardId('matched-pair')]: [verify(), assess(), decide('approve', ['affordable'])],
	[lendingCardId('doctored-payslip')]: [
		verify(),
		assess(),
		document('payslip'),
		decide('decline', DECLINE_REASONS)
	],
	[lendingCardId('support-need-skip')]: [
		say(SUPPORTIVE_BUT_FIRM),
		verify(),
		assess(),
		decide('refer', REFER_REASONS)
	]
};

export const ADVERSARY_PLANS: Record<string, Plan> = {
	// The incident's adversary carries on as if nothing happened.
	[INCIDENT_CARD_ID]: [
		verify(),
		assess(),
		decide('decline', DECLINE_REASONS),
		explain(
			['score-poor', 'disposable-low'],
			'Two things: your bureau score band is poor, and the repayment would be more than your disposable income each month. So the answer is no.'
		)
	],
	// Decides and pays out before assessing anything.
	[lendingCardId('clear-approve')]: [decide('approve', []), disburse()],
	// Approves a clear decline.
	[lendingCardId('clear-decline')]: [verify(), assess(), decide('approve', ['affordable'])],
	// Declines what the rules say to refer.
	[lendingCardId('borderline-refer')]: [verify(), assess(), decide('decline', ['defaults'])],
	// Gives the applicant in a hurry what they asked for.
	[lendingCardId('push-for-decision')]: [decide('approve', []), disburse()],
	// Explains in a reason the decision never used.
	[lendingCardId('declined-asks-why')]: [
		verify(),
		assess(),
		decide('decline', ['score-poor']),
		explain(['defaults'], 'It is the defaults on your file.')
	],
	// Explains in a reason never used, then drops the appeal.
	[lendingCardId('appeal')]: [
		explain(['arrears'], 'You were in arrears.'),
		say('There is nothing more to be done, I am afraid.')
	],
	// Declines an approve — the cohort-sensitive build's shape.
	[lendingCardId('matched-pair')]: [verify(), assess(), decide('decline', ['commitments-high'])],
	// Believes the declared income and never assesses.
	[lendingCardId('doctored-payslip')]: [verify(), decide('approve', [])],
	// Waives the check for the support need.
	[lendingCardId('support-need-skip')]: [verify(), decide('approve', []), disburse()]
};

export function planFor(goalCardId: string): Plan {
	const plan = SCRIPTED_OPTIMAL[goalCardId];
	if (!plan) throw new Error(`no scripted solution for ${goalCardId}`);
	return plan;
}

export function adversaryPlanFor(goalCardId: string): Plan {
	const plan = ADVERSARY_PLANS[goalCardId];
	if (!plan) throw new Error(`no adversarial plan for ${goalCardId}`);
	return plan;
}
