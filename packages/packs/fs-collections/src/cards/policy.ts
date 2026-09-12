import type { PolicyCard } from '@craftabot/core';

/**
 * **The policy cards** (WP105, `91-FS-COLLECTIONS.md` §4): v2 leaves only.
 * *No default notice before circumstances* blocks the notice until the
 * circumstances are on the file and always when a support need is
 * disclosed; *Forbearance offered where the rule offers it* blocks a full
 * payment plan for a customer who has disclosed; *Circumstances before the
 * plan* blocks any offer before the circumstances are recorded; *A plan is
 * four-eyes* pauses the agreement for a person.
 */
export const NO_DEFAULT_NOTICE_BEFORE_CIRCUMSTANCES: PolicyCard = {
	id: 'fs-collections/policy/no-default-notice-before-circumstances',
	title: 'No default notice before circumstances',
	description:
		'Blocks a default notice until the customer’s circumstances are on the file, and always for a customer who has disclosed a support need (fca:conc-7:arrears; fca:fg21-1:vulnerability).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'issue-default-notice' },
					{
						kind: 'or',
						any: [
							{
								kind: 'not',
								expr: { kind: 'world-predicate', predicateId: 'circumstances-recorded' }
							},
							{ kind: 'world-predicate', predicateId: 'disclosed' }
						]
					}
				]
			},
			then: 'block-action',
			reason:
				'A default notice follows the circumstances, never a note or a number of missed payments; a disclosed support need stops it.'
		}
	]
};

export const FORBEARANCE_WHERE_THE_RULE_OFFERS_IT: PolicyCard = {
	id: 'fs-collections/policy/forbearance-where-the-rule-offers-it',
	title: 'Forbearance offered where the rule offers it',
	description:
		'Blocks a full payment plan for a customer who has disclosed a support need — the rule’s answer is breathing space (fca:conc-7:arrears; fca:fg21-1:vulnerability).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'offer-plan' },
					{ kind: 'world-predicate', predicateId: 'disclosed' },
					{ kind: 'argument-contains', path: 'plan', value: 'payment-plan' }
				]
			},
			then: 'block-action',
			reason: 'A disclosed support need is met with forbearance, not a full plan.'
		}
	]
};

export const CIRCUMSTANCES_BEFORE_THE_PLAN: PolicyCard = {
	id: 'fs-collections/policy/circumstances-before-the-plan',
	title: 'Circumstances before the plan',
	description:
		'Blocks any offer until the customer’s circumstances are on the file (fca:conc-7:arrears).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'offer-plan' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'circumstances-recorded' } }
				]
			},
			then: 'block-action',
			reason: 'The plan follows the circumstances.'
		}
	]
};

export const A_PLAN_IS_FOUR_EYES: PolicyCard = {
	id: 'fs-collections/policy/a-plan-is-four-eyes',
	title: 'A plan is four-eyes',
	description:
		'Pauses the agreement of a plan for a person — a contract on the account (pra:ss1-23:mitigants).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'agree-plan' },
			then: 'require-approval',
			reason: 'A plan is agreed: a second pair of eyes first.'
		}
	]
};

export const collectionsPolicyCards: PolicyCard[] = [
	NO_DEFAULT_NOTICE_BEFORE_CIRCUMSTANCES,
	FORBEARANCE_WHERE_THE_RULE_OFFERS_IT,
	CIRCUMSTANCES_BEFORE_THE_PLAN,
	A_PLAN_IS_FOUR_EYES
];

export const COLLECTIONS_POLICY_CARD_IDS: readonly string[] = collectionsPolicyCards.map(
	(card) => card.id
);
