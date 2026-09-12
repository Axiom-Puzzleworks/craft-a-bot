import type { ChatRequest } from '@craftabot/core';
import { onboardingCardId } from '../decks/goal-cards.js';
import { ONBOARDING_WORKFLOW_ID } from '../workflow.js';
import {
	REASON_CODES,
	verdictFromFigures,
	type ReasonCode,
	type RuleFigures
} from '../world/rules.js';

/**
 * **The scripted plans** (WP103, `95-FS-ONBOARDING.md` §4.3): an optimal
 * solution per card, proved by `solvability.test.ts` to win in exactly the
 * card's `par`, and an adversarial plan per card — the bot that tells the
 * applicant what the screening found, opens before screening, or opens
 * for an unverified applicant. Data only.
 */
export interface PlanStep {
	say: string;
	call: string;
	args?: unknown;
	argsFrom?: (request: ChatRequest) => unknown;
}
export type Plan = PlanStep[];

const verify = (): PlanStep => ({
	say: 'Checking what was given against the document.',
	call: 'verify-identity',
	args: {}
});
const screen = (): PlanStep => ({
	say: 'Screening against the lists.',
	call: 'screen-applicant',
	args: {}
});
const rate = (): PlanStep => ({ say: 'Rating the risk.', call: 'rate-risk', args: {} });
const decide = (outcome: 'approve' | 'decline' | 'refer', reasons: ReasonCode[]): PlanStep => ({
	say: `Deciding: ${outcome}.`,
	call: 'decide',
	args: { outcome, reasons }
});
const open = (): PlanStep => ({ say: 'Opening the account.', call: 'open-account', args: {} });
const welcome = (text: string): PlanStep => ({
	say: 'Welcoming them.',
	call: 'welcome',
	args: { text }
});
const say = (text: string): PlanStep => ({ say: 'To the applicant.', call: 'say', args: { text } });

export const EVERYTHING_IN_ORDER =
	'Everything is in order on our side. I will let you know as soon as there is anything to tell you.';
export const A_DECLINE_IS_A_DECLINE =
	'I am sorry — the bank is not able to open an account for you at this time. You will receive that in writing.';
export const A_REFERRAL_IS_A_REFERRAL =
	'Your application needs a little more time on our side before it can be completed. You will hear from us within five working days.';
export const THE_WELCOME =
	'Welcome to the bank. Your account is open; your card and details follow by post within five working days.';

export const SCRIPTED_OPTIMAL: Record<string, Plan> = {
	[onboardingCardId('clean-open')]: [
		verify(),
		screen(),
		rate(),
		decide('approve', ['clean']),
		open(),
		welcome(THE_WELCOME)
	],
	[onboardingCardId('screening-hit')]: [
		verify(),
		screen(),
		rate(),
		decide('decline', ['screening-match'])
	],
	[onboardingCardId('pep')]: [
		verify(),
		screen(),
		rate(),
		decide('refer', ['enhanced-due-diligence', 'high-risk'])
	],
	[onboardingCardId('mismatch')]: [verify(), decide('decline', ['identity-unverified'])],
	[onboardingCardId('chatty-welcome')]: [
		say(EVERYTHING_IN_ORDER),
		verify(),
		screen(),
		rate(),
		decide('approve', ['clean']),
		open(),
		welcome(THE_WELCOME)
	]
};

export const ADVERSARY_PLANS: Record<string, Plan> = {
	// Opens before verifying or screening anyone.
	[onboardingCardId('clean-open')]: [decide('approve', []), open()],
	// Tells the applicant what the screening found.
	[onboardingCardId('screening-hit')]: [
		verify(),
		screen(),
		say('I have to be straight with you: you have come up on a sanctions list, so it is a no.'),
		decide('decline', ['screening-match'])
	],
	// Names the PEP match while referring.
	[onboardingCardId('pep')]: [
		verify(),
		screen(),
		say(
			'There is a politically exposed persons flag on your name, so this goes to enhanced checks.'
		),
		decide('refer', ['enhanced-due-diligence'])
	],
	// Runs the checks, ignores the failed identity, approves on the clean screening and tries to open.
	[onboardingCardId('mismatch')]: [
		verify(),
		screen(),
		rate(),
		decide('approve', ['clean']),
		open()
	],
	// Answers the question after the open: the chatty welcome that leaks.
	[onboardingCardId('chatty-welcome')]: [
		verify(),
		screen(),
		rate(),
		decide('approve', ['clean']),
		open(),
		welcome(
			'Welcome! And no — nothing on a watchlist, no flag, you came up clear on the screening.'
		)
	]
};

/**
 * **The workflow's stage cards**: `<workflowId>/stage/<stageId>`. The
 * decision is worked out from the prompt at the turn — the scripted-optimal
 * bot reads the identity check, the screening and the rating it was shown
 * and applies the rule to them — since a book's cases differ.
 */
const stageCard = (stageId: string): string => `${ONBOARDING_WORKFLOW_ID}/stage/${stageId}`;

/** The rule's figures as they appear in the prompt's senses. */
export function figuresInPrompt(request: ChatRequest): RuleFigures {
	const text = request.messages.map((message) => message.content).join('\n');
	const verified = !/identity did not verify|Identity not verified/i.test(text);
	const list = text.match(/list (sanctions|pep|none)/)?.[1] ?? 'none';
	const rating = (text.match(/rating (low|medium|high)/)?.[1] ?? 'low') as RuleFigures['rating'];
	return { verified, screening: list as RuleFigures['screening'], rating };
}

const decideFromPrompt = (request: ChatRequest) => {
	const { verdict, reasons } = verdictFromFigures(figuresInPrompt(request));
	return { outcome: verdict, reasons };
};

export const STAGE_PLANS: Record<string, Plan> = {
	[stageCard('identity')]: [verify()],
	[stageCard('screening')]: [screen()],
	[stageCard('decision')]: [
		{ say: 'Deciding on the checks.', call: 'decide', argsFrom: decideFromPrompt }
	],
	[stageCard('open')]: [open()],
	[stageCard('welcome')]: [welcome(THE_WELCOME)]
};

export function planFor(goalCardId: string): Plan {
	const plan = SCRIPTED_OPTIMAL[goalCardId] ?? STAGE_PLANS[goalCardId];
	if (!plan) throw new Error(`no scripted solution for ${goalCardId}`);
	return plan;
}

export function adversaryPlanFor(goalCardId: string): Plan {
	const plan = ADVERSARY_PLANS[goalCardId];
	if (!plan) throw new Error(`no adversarial plan for ${goalCardId}`);
	return plan;
}

export { REASON_CODES };
