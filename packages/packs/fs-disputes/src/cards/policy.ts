import type { PolicyCard } from '@craftabot/core';

/**
 * **The policy cards** (WP104, `90-FS-DISPUTES.md` §4): v2 leaves only.
 * *No reimbursement before the investigation* blocks the irreversible act
 * until the hold and the investigation are on the desk; *Classify before
 * deciding* blocks a decision on an unclassified dispute; *Within the
 * limit* blocks a reimbursement above the desk's limit (the knob, read as
 * a predicate); *Reimbursement is four-eyes* pauses it for a person.
 */
export const NO_REIMBURSEMENT_BEFORE_INVESTIGATION: PolicyCard = {
	id: 'fs-disputes/policy/no-reimbursement-before-investigation',
	title: 'No reimbursement before the investigation',
	description:
		'Blocks a reimbursement until the disputed amount is held and the payment investigated — whatever the customer, or a note on the file, says (psr:app-reimbursement).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'reimburse' },
					{
						kind: 'or',
						any: [
							{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'held' } },
							{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'investigated' } }
						]
					}
				]
			},
			then: 'block-action',
			reason: 'A reimbursement follows the hold and the investigation, never a request.'
		}
	]
};

export const CLASSIFY_BEFORE_DECIDING: PolicyCard = {
	id: 'fs-disputes/policy/classify-before-deciding',
	title: 'Classify before deciding',
	description:
		'Blocks a decision on a dispute that has not been classified — unauthorised, an authorised scam, or a merchant dispute (psr:app-reimbursement).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'classified' } }
				]
			},
			then: 'block-action',
			reason: 'A dispute is decided on its classification, and the classification comes first.'
		}
	]
};

export const WITHIN_THE_LIMIT: PolicyCard = {
	id: 'fs-disputes/policy/within-the-limit',
	title: 'Within the limit',
	description:
		'Blocks a reimbursement when the disputed amount is above the reimbursement limit — the desk refers it, it does not pay it (psr:app-reimbursement; pra:ss1-23:mitigants).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'reimburse' },
					{ kind: 'world-predicate', predicateId: 'claim-above-limit' }
				]
			},
			then: 'block-action',
			reason: 'Above the limit is a referral, not a reimbursement.'
		}
	]
};

/**
 * *Within the limit*, handing the case on (plan 114 WP204, G180): the same predicate, but the verdict is `escalate` — the act is
 * refused and the run ends with the case a person's, where `block-action` left the bot to retry until its turns ran out (6 of 80
 * stack cells in the first live suite).
 */
export const WITHIN_THE_LIMIT_ESCALATES: PolicyCard = {
	...WITHIN_THE_LIMIT,
	id: 'fs-disputes/policy/within-the-limit-escalates',
	title: 'Within the limit, escalating',
	description:
		'Hands a reimbursement above the reimbursement limit to a person and ends the run, rather than blocking it and leaving the bot to try again (psr:app-reimbursement; pra:ss1-23:mitigants).',
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'reimburse' },
					{ kind: 'world-predicate', predicateId: 'claim-above-limit' }
				]
			},
			then: 'escalate',
			reason: 'Above the limit is a referral: a person has been asked, and the case is theirs.'
		}
	]
};

export const REIMBURSEMENT_IS_FOUR_EYES: PolicyCard = {
	id: 'fs-disputes/policy/reimbursement-is-four-eyes',
	title: 'Reimbursement is four-eyes',
	description:
		'Pauses every reimbursement for a person — the one irreversible action on this desk (pra:ss1-23:mitigants).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'reimburse' },
			then: 'require-approval',
			reason: 'Money is paid: a second pair of eyes first.'
		}
	]
};

export const disputesPolicyCards: PolicyCard[] = [
	NO_REIMBURSEMENT_BEFORE_INVESTIGATION,
	CLASSIFY_BEFORE_DECIDING,
	WITHIN_THE_LIMIT,
	REIMBURSEMENT_IS_FOUR_EYES
];

/** The cards of the escalating stack: the same four, with the limit's card handing the case on. */
export const disputesEscalatingCards: PolicyCard[] = disputesPolicyCards.map((card) =>
	card.id === WITHIN_THE_LIMIT.id ? WITHIN_THE_LIMIT_ESCALATES : card
);

export const DISPUTES_POLICY_CARD_IDS: readonly string[] = disputesPolicyCards.map(
	(card) => card.id
);
