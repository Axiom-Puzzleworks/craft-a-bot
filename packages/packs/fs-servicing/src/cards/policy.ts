import type { PolicyCard } from '@craftabot/core';

/**
 * **The policy cards** (WP106, `92-FS-SERVICING.md` §4): v2 leaves only.
 * *Verify before act* blocks every act on the file until the caller is
 * verified; *Record a disclosure* blocks a closure while a bereavement is
 * on the desk unrecorded; *Closure is four-eyes* pauses it for a person;
 * *Access on an authority* blocks third-party access without one on file.
 */
const ACTS = [
	'update-address',
	'reissue-card',
	'grant-third-party-access',
	'close-account'
] as const;

export const VERIFY_BEFORE_ACT: PolicyCard = {
	id: 'fs-servicing/policy/verify-before-act',
	title: 'Verify before act',
	description:
		'Blocks any change to the file — an address, a card, an access, a closure — until the caller has been verified against it (ukgdpr:purpose-limitation; mlr:kyc).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'or', any: ACTS.map((value) => ({ kind: 'call-name-is' as const, value })) },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'verified' } }
				]
			},
			then: 'block-action',
			reason: 'An unverified caller changes nothing on the file.'
		}
	]
};

export const RECORD_A_DISCLOSURE: PolicyCard = {
	id: 'fs-servicing/policy/record-a-disclosure',
	title: 'Record a disclosure',
	description:
		'Blocks a closure while a bereavement is on the desk with no support need recorded — what the caller said goes on the file before the act (fca:fg21-1:vulnerability).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'close-account' },
					{ kind: 'world-predicate', predicateId: 'bereavement-unrecorded' }
				]
			},
			then: 'block-action',
			reason: 'A bereavement is recorded as a support need before anything is closed.'
		}
	]
};

export const CLOSURE_IS_FOUR_EYES: PolicyCard = {
	id: 'fs-servicing/policy/closure-is-four-eyes',
	title: 'Closure is four-eyes',
	description:
		'Pauses every account closure for a person — the one irreversible action on this desk (pra:ss1-23:mitigants).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'close-account' },
			then: 'require-approval',
			reason: 'An account is closed: a second pair of eyes first.'
		}
	]
};

export const ACCESS_ON_AN_AUTHORITY: PolicyCard = {
	id: 'fs-servicing/policy/access-on-an-authority',
	title: 'Access on an authority',
	description:
		'Blocks third-party access to an account unless the file carries an authority for it (ukgdpr:purpose-limitation; ukgdpr:data-minimisation).',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: {
				kind: 'and',
				all: [
					{ kind: 'call-name-is', value: 'grant-third-party-access' },
					{ kind: 'not', expr: { kind: 'world-predicate', predicateId: 'authority-on-file' } }
				]
			},
			then: 'block-action',
			reason: 'Access follows an authority on file, never a request alone.'
		}
	]
};

export const servicingPolicyCards: PolicyCard[] = [
	VERIFY_BEFORE_ACT,
	RECORD_A_DISCLOSURE,
	CLOSURE_IS_FOUR_EYES,
	ACCESS_ON_AN_AUTHORITY
];

export const SERVICING_POLICY_CARD_IDS: readonly string[] = servicingPolicyCards.map(
	(card) => card.id
);
