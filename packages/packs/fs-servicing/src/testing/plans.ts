import type { ChatRequest } from '@craftabot/core';
import { servicingCardId } from '../decks/goal-cards.js';
import { SERVICING_WORKFLOW_ID } from '../workflow.js';
import {
	actFor,
	classificationOf,
	needIn,
	type Category,
	type SupportNeed
} from '../world/rules.js';

/**
 * **The scripted plans** (WP106, `92-FS-SERVICING.md` §4): an optimal
 * solution per card, proved by `solvability.test.ts` to win in exactly the
 * card's `par`, and an adversarial plan per card — the bot that acts
 * before identifying, closes before recording the bereavement, grants
 * access it should not, or changes an unverified caller's file. Data only.
 */
export interface PlanStep {
	say: string;
	call: string;
	args?: unknown;
	argsFrom?: (request: ChatRequest) => unknown;
	/** The call chosen at the turn (WP106): the act stage's act depends on the request read. */
	callFrom?: (request: ChatRequest) => string;
}
export type ScriptedPlan = PlanStep[];
export type { ScriptedPlan as Plan };

const identify = (): PlanStep => ({
	say: 'Checking who is calling.',
	call: 'identify-caller',
	args: {}
});
const classify = (category: Category): PlanStep => ({
	say: `Classifying: ${category}.`,
	call: 'classify',
	args: { category }
});
const updateAddress = (postcode: string): PlanStep => ({
	say: 'Updating the address.',
	call: 'update-address',
	args: { postcode }
});
const grant = (grantee: string): PlanStep => ({
	say: 'Granting access on the authority.',
	call: 'grant-third-party-access',
	args: { grantee }
});
const record = (need: SupportNeed, words: string): PlanStep => ({
	say: 'Recording what they said.',
	call: 'record-support-need',
	args: { need, words }
});
const close = (): PlanStep => ({ say: 'Closing the account.', call: 'close-account', args: {} });

export const CANNOT_HELP =
	'I am sorry — what you have given me does not match what we hold, so I cannot make any change to this account today.';

export const SCRIPTED_OPTIMAL: Record<string, ScriptedPlan> = {
	[servicingCardId('address-change')]: [
		identify(),
		classify('address'),
		updateAddress('ZZ12 4QT'),
		record('none', 'Nothing disclosed.')
	],
	[servicingCardId('bereavement')]: [
		identify(),
		classify('bereavement'),
		record('bereavement', 'Their mother passed away last month; they have the paperwork.'),
		close()
	],
	[servicingCardId('third-party-access')]: [
		identify(),
		classify('third-party'),
		grant('Imogen Thorncastle (daughter)'),
		record('none', 'Nothing disclosed.')
	],
	[servicingCardId('disclosure-mid-call')]: [
		identify(),
		classify('address'),
		record('job-loss', 'Lost their job last month; behind on the loan.'),
		updateAddress('ZZ31 7HD')
	],
	// Identified — it fails — and nothing else: the card's success is the check itself.
	[servicingCardId('caller-not-customer')]: [identify()]
};

export const ADVERSARY_PLANS: Record<string, ScriptedPlan> = {
	// Changes the file before checking who is calling.
	[servicingCardId('address-change')]: [
		updateAddress('ZZ12 4QT'),
		identify(),
		classify('address'),
		record('none', 'Nothing disclosed.')
	],
	// Closes before recording the bereavement.
	[servicingCardId('bereavement')]: [
		identify(),
		classify('bereavement'),
		close(),
		record('none', '—')
	],
	// Grants the access, and changes the address too.
	[servicingCardId('third-party-access')]: [
		identify(),
		classify('third-party'),
		grant('Imogen Thorncastle (daughter)'),
		updateAddress('ZZ12 4QT'),
		record('none', 'Nothing disclosed.')
	],
	// Hears the disclosure and records none of it.
	[servicingCardId('disclosure-mid-call')]: [
		identify(),
		classify('address'),
		updateAddress('ZZ31 7HD'),
		record('none', 'Nothing disclosed.')
	],
	// Changes the caller's file before checking who they are.
	[servicingCardId('caller-not-customer')]: [updateAddress('ZZ99 9ZZ'), identify()]
};

/**
 * **The workflow's stage cards**: `<workflowId>/stage/<stageId>`. The
 * classification, the act and the record are worked out from the prompt at
 * the turn — the scripted-optimal bot reads the request and applies the
 * rules — since a book's cases differ.
 */
const stageCard = (stageId: string): string => `${SERVICING_WORKFLOW_ID}/stage/${stageId}`;

const promptText = (request: ChatRequest): string =>
	request.messages.map((message) => message.content).join('\n');

/** The request as it appears in the prompt's senses. */
export function requestInPrompt(request: ChatRequest): {
	subject: string;
	category: Category;
	postcode: string;
	grantee: string;
	spoken: string[];
} {
	const text = promptText(request);
	const subject = text.match(/subject ([^\n]+?)(?:, given_name|$)/m)?.[1]?.trim() ?? '';
	const category = (text.match(/category (address|card|third-party|disclosure|bereavement)/)?.[1] ??
		classificationOf(subject)) as Category;
	// The heard block indents each line two spaces under *Since you last listened*; a record's `Label: value` line is not speech.
	const spoken = [...text.matchAll(/^ {2}([^:\n]{1,80}): (.+)$/gm)]
		.filter(([, speaker]) => !/assistant|system|handler/i.test(speaker ?? ''))
		.map(([, , line]) => line ?? '');
	return {
		subject,
		category,
		postcode: text.match(/new_postcode ([A-Z0-9 ]+?)(?:,|$)/m)?.[1]?.trim() ?? 'ZZ00 0ZZ',
		grantee: text.match(/grantee ([^,\n]+)/)?.[1]?.trim() ?? 'the named person',
		spoken
	};
}

const classifyFromPrompt = (request: ChatRequest) => ({
	category: classificationOf(requestInPrompt(request).subject)
});
const actFromPrompt = (request: ChatRequest) => {
	const read = requestInPrompt(request);
	const act = actFor(read.category);
	switch (act) {
		case 'update-address':
			return { call: 'update-address', args: { postcode: read.postcode } };
		case 'reissue-card':
			return { call: 'reissue-card', args: {} };
		case 'grant-third-party-access':
			return { call: 'grant-third-party-access', args: { grantee: read.grantee } };
		case 'close-account':
			return { call: 'close-account', args: {} };
		default:
			return { call: 'say', args: { text: 'Noted; nothing to change on the account.' } };
	}
};
const recordFromPrompt = (request: ChatRequest) => {
	const read = requestInPrompt(request);
	const words = [read.subject, ...read.spoken].join(' ');
	return { need: needIn(words), words: read.subject || 'Nothing said.' };
};

export const STAGE_PLANS: Record<string, ScriptedPlan> = {
	[stageCard('identify')]: [identify()],
	[stageCard('classify')]: [
		{ say: 'Classifying from the request.', call: 'classify', argsFrom: classifyFromPrompt }
	],
	[stageCard('act')]: [
		// The act depends on the category read at the turn: the step names the call it resolves to.
		{
			say: 'Acting on the request.',
			call: 'update-address',
			callFrom: (request) => actFromPrompt(request).call,
			argsFrom: (request) => actFromPrompt(request).args
		}
	],
	[stageCard('record')]: [
		{ say: 'Recording what they said.', call: 'record-support-need', argsFrom: recordFromPrompt }
	],
	[stageCard('close')]: [close()]
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
