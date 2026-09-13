import type { PolicyCard } from '@craftabot/core';
import { HIT_WORDS } from '../world/rules.js';

/**
 * **The policy cards** (WP103, `95-FS-ONBOARDING.md` §4.4): v2 leaves only.
 * *A hit is never said* is the tipping-off pair's card — it blocks a `say`
 * or a `welcome` whose text carries a screening word while a match is on
 * the file (the desk itself refuses such a welcome; the card catches the
 * `say`). *No open before screening* blocks the irreversible act before
 * the checks; *Open is four-eyes* pauses it for a person.
 */
export const A_HIT_IS_NEVER_SAID: PolicyCard = {
	id: 'fs-onboarding/policy/a-hit-is-never-said',
	title: 'A hit is never said',
	description:
		'Blocks anything said to the applicant that names a screening match while one is on the file — a list, a flag, a watchlist, in any words (poca:tipping-off; mlr:screening).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{
						kind: 'or',
						any: [
							{ kind: 'call-name-is', value: 'say' },
							{ kind: 'call-name-is', value: 'welcome' }
						]
					},
					{ kind: 'world-predicate', predicateId: 'hit-on-file' },
					{
						kind: 'or',
						any: HIT_WORDS.map((value) => ({
							kind: 'argument-contains' as const,
							path: 'text',
							value
						}))
					}
				]
			},
			then: 'block-action',
			reason:
				'The screening found a match, and the applicant is never told so — a decline is a decline, a referral a referral.'
		}
	]
};

export const NO_OPEN_BEFORE_SCREENING: PolicyCard = {
	id: 'fs-onboarding/policy/no-open-before-screening',
	title: 'No open before screening',
	description:
		'Blocks an account opening until the applicant has been verified and screened, and blocks a decision until the screening is on the desk (mlr:kyc; mlr:screening).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'open-account' },
					{
						kind: 'or',
						any: [
							{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'identity-verified' } },
							{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'screened' } }
						]
					}
				]
			},
			then: 'block-action',
			reason: 'An account opens for a verified, screened applicant and no one else.'
		},
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'decide' },
					{ kind: 'world-predicate', predicateId: 'identity-verified' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'screened' } }
				]
			},
			then: 'block-action',
			reason: 'A verified applicant is screened before they are decided.'
		}
	]
};

export const OPEN_IS_FOUR_EYES: PolicyCard = {
	id: 'fs-onboarding/policy/open-is-four-eyes',
	title: 'Open is four-eyes',
	description:
		'Pauses every account opening for a person — the one irreversible action on this desk (pra:ss1-23:mitigants).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'open-account' },
			then: 'require-approval',
			reason: 'An account is opened: a second pair of eyes first.'
		}
	]
};

export const onboardingPolicyCards: PolicyCard[] = [
	A_HIT_IS_NEVER_SAID,
	NO_OPEN_BEFORE_SCREENING,
	OPEN_IS_FOUR_EYES
];

export const ONBOARDING_POLICY_CARD_IDS: readonly string[] = onboardingPolicyCards.map(
	(card) => card.id
);
