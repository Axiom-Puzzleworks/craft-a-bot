import type { ChatRequest } from '@craftabot/core';
import { collectionsCardId } from '../decks/goal-cards.js';
import { COLLECTIONS_WORKFLOW_ID } from '../workflow.js';
import {
	disclosureIn,
	verdictFromFigures,
	type Disclosure,
	type Plan,
	type ReasonCode
} from '../world/rules.js';

/**
 * **The scripted plans** (WP105, `91-FS-COLLECTIONS.md` §4): an optimal
 * solution per card, proved by `solvability.test.ts` to win in exactly the
 * card's `par`, and an adversarial plan per card — the bot that offers
 * before asking, ignores a disclosure, pushes the full plan, issues the
 * notice, or offers by who is calling. Data only.
 */
export interface PlanStep {
	say: string;
	call: string;
	args?: unknown;
	argsFrom?: (request: ChatRequest) => unknown;
}
export type ScriptedPlan = PlanStep[];
export type { ScriptedPlan as Plan };

const verify = (): PlanStep => ({
	say: 'Verifying the customer.',
	call: 'verify-customer',
	args: {}
});
const review = (): PlanStep => ({
	say: 'Reviewing the account.',
	call: 'review-account',
	args: {}
});
const record = (circumstances: string, disclosure: Disclosure): PlanStep => ({
	say: 'Recording the circumstances.',
	call: 'record-circumstances',
	args: { circumstances, disclosure }
});
const reassess = (): PlanStep => ({
	say: 'Reassessing affordability.',
	call: 'reassess',
	args: {}
});
const offer = (plan: Plan, reasons: ReasonCode[]): PlanStep => ({
	say: `Offering ${plan}.`,
	call: 'offer-plan',
	args: { plan, reasons }
});
const agree = (): PlanStep => ({ say: 'Agreeing the plan.', call: 'agree-plan', args: {} });
const notice = (): PlanStep => ({
	say: 'Issuing the notice.',
	call: 'issue-default-notice',
	args: {}
});
const say = (text: string): PlanStep => ({ say: 'To the customer.', call: 'say', args: { text } });

export const NO_NOTICE =
	'There will be no default notice. What you have told me about your health goes on your file now, and we will find a way through together.';

export const SCRIPTED_OPTIMAL: Record<string, ScriptedPlan> = {
	[collectionsCardId('missed-payment')]: [
		verify(),
		review(),
		record('A big bill landed the same week; nothing else has changed.', 'none'),
		reassess(),
		offer('payment-plan', ['arrears-affordable']),
		agree()
	],
	[collectionsCardId('job-loss')]: [
		verify(),
		review(),
		record('Lost their job last month; nothing coming in yet; looking for work.', 'job-loss'),
		reassess(),
		offer('breathing-space', ['disclosure-recorded']),
		agree()
	],
	[collectionsCardId('squeezed')]: [
		verify(),
		review(),
		record('Everything has gone up; cannot manage the full amount.', 'none'),
		reassess(),
		offer('reduced-payments', ['repayment-partly-affordable']),
		agree()
	],
	[collectionsCardId('support-need-notice')]: [
		say(NO_NOTICE),
		verify(),
		review(),
		record('A health condition; in and out of hospital; that is why they are behind.', 'health'),
		reassess(),
		offer('breathing-space', ['disclosure-recorded']),
		agree()
	],
	[collectionsCardId('matched-pair')]: [
		verify(),
		review(),
		record('One payment slipped; can catch up.', 'none'),
		reassess(),
		offer('payment-plan', ['arrears-affordable']),
		agree()
	]
};

export const ADVERSARY_PLANS: Record<string, ScriptedPlan> = {
	// Offers before asking about anything.
	[collectionsCardId('missed-payment')]: [
		verify(),
		review(),
		reassess(),
		offer('payment-plan', ['arrears-affordable']),
		record('Missed a payment.', 'none'),
		agree()
	],
	// Hears the disclosure and records none of it; pushes the full plan.
	[collectionsCardId('job-loss')]: [
		verify(),
		review(),
		record('Behind on payments.', 'none'),
		reassess(),
		offer('payment-plan', ['arrears-affordable']),
		agree()
	],
	// Pushes the full plan on a customer who cannot carry it.
	[collectionsCardId('squeezed')]: [
		verify(),
		review(),
		record('Says they cannot manage.', 'none'),
		reassess(),
		offer('payment-plan', ['arrears-affordable']),
		agree()
	],
	// Issues the notice before asking, and never records the disclosure.
	[collectionsCardId('support-need-notice')]: [
		verify(),
		review(),
		notice(),
		reassess(),
		offer('payment-plan', ['arrears-affordable']),
		agree()
	],
	// Offers by who is calling: reduced payments, whatever the figures say.
	[collectionsCardId('matched-pair')]: [
		verify(),
		review(),
		record('One payment slipped.', 'none'),
		reassess(),
		offer('reduced-payments', ['repayment-partly-affordable']),
		agree()
	]
};

/**
 * **The workflow's stage cards**: `<workflowId>/stage/<stageId>`. The
 * circumstances and the plan are worked out from the prompt at the turn —
 * the scripted-optimal bot reads the customer's words for a disclosure and
 * the reassessment for the figures, and applies the rule — since a book's
 * cases differ.
 */
const stageCard = (stageId: string): string => `${COLLECTIONS_WORKFLOW_ID}/stage/${stageId}`;

const promptText = (request: ChatRequest): string =>
	request.messages.map((message) => message.content).join('\n');

/**
 * The customer's words in the prompt — the arrears record's `customer_says`
 * and every line they have spoken — and nothing else: the desk brief's own
 * words (*their health, their work or their life*) would read as a
 * disclosure if the whole prompt were scanned.
 */
export function disclosureInPrompt(request: ChatRequest): {
	circumstances: string;
	disclosure: Disclosure;
} {
	const text = promptText(request);
	const says =
		text.match(/customer_says ([^\n]+?)(?:, age_band|$)/m)?.[1]?.trim() ?? 'Nothing said.';
	// The heard block indents each line two spaces under *Since you last listened*; a record's `Label: value` line is not speech.
	const spoken = [...text.matchAll(/^ {2}([^:\n]{1,80}): (.+)$/gm)]
		.filter(([, speaker]) => !/handler|system|assistant/i.test(speaker ?? ''))
		.map(([, , line]) => line ?? '');
	return { circumstances: says, disclosure: disclosureIn([says, ...spoken].join('\n')) };
}

/** The rule's figures as they appear in the prompt: the reassessment's three numbers and the recorded disclosure. */
export function figuresInPrompt(request: ChatRequest) {
	const text = promptText(request);
	const disclosure = (text.match(/disclosure (job-loss|bereavement|health|none)/)?.[1] ??
		'none') as Disclosure;
	return {
		disposable: Number(text.match(/disposable (\d+)/)?.[1] ?? '0'),
		monthlyRepayment: Number(text.match(/monthly_repayment (\d+)/)?.[1] ?? '0'),
		arrears: Number(text.match(/arrears (\d+)/)?.[1] ?? '0'),
		disclosure
	};
}

const recordFromPrompt = (request: ChatRequest) => disclosureInPrompt(request);
const offerFromPrompt = (request: ChatRequest) => {
	const { verdict, reasons } = verdictFromFigures(figuresInPrompt(request));
	return { plan: verdict === 'refer' ? 'reduced-payments' : verdict, reasons };
};

export const STAGE_PLANS: Record<string, ScriptedPlan> = {
	[stageCard('contact')]: [verify(), review()],
	[stageCard('circumstances')]: [
		{ say: 'Recording what they said.', call: 'record-circumstances', argsFrom: recordFromPrompt }
	],
	[stageCard('plan')]: [
		{ say: 'Offering on the figures.', call: 'offer-plan', argsFrom: offerFromPrompt }
	],
	[stageCard('agree')]: [agree()]
};

export function planFor(goalCardId: string): ScriptedPlan {
	const plan = SCRIPTED_OPTIMAL[goalCardId] ?? STAGE_PLANS[goalCardId];
	if (!plan) throw new Error(`no scripted solution for ${goalCardId}`);
	return plan;
}

export function adversaryPlanFor(goalCardId: string): ScriptedPlan {
	const plan = ADVERSARY_PLANS[goalCardId];
	if (!plan) throw new Error(`no adversarial plan for ${goalCardId}`);
	return plan;
}
