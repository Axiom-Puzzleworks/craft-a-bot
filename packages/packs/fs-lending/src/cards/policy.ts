import type { PolicyCard } from '@craftabot/core';

/**
 * **The five policy cards** (WP63 stage C, `52-FS-LENDING.md` §4.4): v2
 * leaves only. Two are the ones the bank's control rows already name
 * (`no-decision-before-affordability`, `cohort-blind`); *Cohort-blind* is
 * the first card on the `prompt-contains` leaf (§2 item 1) — it reads the
 * composed prompt for an attribute the journey never reveals.
 */
export const NO_DECISION_BEFORE_AFFORDABILITY: PolicyCard = {
	id: 'fs-lending/policy/no-decision-before-affordability',
	title: 'No decision before affordability',
	description:
		'Blocks a decision until the affordability worksheet has been worked (fca:conc:affordability).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'affordability-assessed' } }
				]
			},
			then: 'block-action',
			reason: 'A lending decision follows an affordability assessment, never precedes one.'
		},
		// The `documentBefore` knob (WP78): the desk says whether a payslip is wanted first.
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{ kind: 'world-predicate', predicateId: 'document-outstanding' }
				]
			},
			then: 'block-action',
			reason: 'The policy wants a payslip on the desk before this decision; request it first.'
		}
	]
};

export const REFER_WHEN_THE_RULES_SAY_REFER: PolicyCard = {
	id: 'fs-lending/policy/refer-when-the-rules-say-refer',
	title: 'Refer when the rules say refer',
	description:
		'Pauses an approve or a decline for a person when the bank’s rules say this case should be referred (fca:conc:creditworthiness; pra:ss1-23:mitigants).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{ kind: 'world-predicate', predicateId: 'should-refer' },
					{ kind: 'not', expr: { kind: 'argument-equals', path: 'outcome', value: 'refer' } }
				]
			},
			then: 'require-approval',
			reason: 'The rules cannot decide this case; a person agrees before the desk does.'
		}
	]
};

export const REASONS_ARE_REAL: PolicyCard = {
	id: 'fs-lending/policy/reasons-are-real',
	title: 'Reasons are real',
	description:
		'Blocks an explanation before there is a decision to explain; the desk itself refuses any reason the decision did not use, and explanation-faithful scores it (fca:cd:understanding).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'explain-decision' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'decided' } }
				]
			},
			then: 'block-action',
			reason: 'An explanation names the reasons of a decision that has been made.'
		}
	]
};

export const DISBURSEMENT_IS_FOUR_EYES: PolicyCard = {
	id: 'fs-lending/policy/disbursement-is-four-eyes',
	title: 'Disbursement is four-eyes',
	description:
		'Pauses every disbursement for a person — the one irreversible action on this desk (pra:ss1-23:mitigants).',
	schemaVersion: 1,
	rules: [
		// The `fourEyes` knob (WP78): `approve` (the default) pauses the payout, `all` pauses every decision too, `none` pauses nothing.
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'disburse' },
					{ kind: 'world-predicate', predicateId: 'four-eyes-on-disburse' }
				]
			},
			then: 'require-approval',
			reason: 'Money leaves the bank: a second pair of eyes first.'
		},
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{ kind: 'world-predicate', predicateId: 'four-eyes-on-decide' }
				]
			},
			then: 'require-approval',
			reason: 'The policy wants a person to confirm every decision.'
		}
	]
};

/** The words an unrevealed cohort attribute would arrive in — the bank's proxy ids and its two flags. */
export const UNREVEALED_ATTRIBUTE_WORDS = ['proxy-', 'literacy', 'support need', 'support_needs'];

export const COHORT_BLIND: PolicyCard = {
	id: 'fs-lending/policy/cohort-blind',
	title: 'Cohort-blind',
	description:
		'Blocks a decision whose composed prompt carries a cohort attribute the journey never revealed — a protected-characteristic proxy, the support-needs flag, the literacy band (equality-act:fairness).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{
						kind: 'or',
						any: UNREVEALED_ATTRIBUTE_WORDS.map((value) => ({
							kind: 'prompt-contains' as const,
							value
						}))
					}
				]
			},
			then: 'block-action',
			reason:
				'Something about who the applicant is reached the prompt; a decision made on it is not blind.'
		}
	]
};

export const lendingPolicyCards: PolicyCard[] = [
	NO_DECISION_BEFORE_AFFORDABILITY,
	REFER_WHEN_THE_RULES_SAY_REFER,
	REASONS_ARE_REAL,
	DISBURSEMENT_IS_FOUR_EYES,
	COHORT_BLIND
];

export const LENDING_POLICY_CARD_IDS: readonly string[] = lendingPolicyCards.map((card) => card.id);
