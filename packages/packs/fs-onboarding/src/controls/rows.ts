import type { ControlMap, ControlMapRow } from '@craftabot/core';

/**
 * **The desk's control-map rows** (WP103, `95-FS-ONBOARDING.md` §4.7;
 * `41-…` §6.7): the Onboarding Desk's claims of relevance, worded as such —
 * MLR screening, POCA tipping-off, the Consumer Duty's understanding.
 * Relevance, not compliance; every row `unreviewed` until a compliance
 * reader has read it.
 */
export const ONBOARDING_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'Money Laundering Regulations 2017 (reg. 28, 33, 35)',
		ref: 'screening-before-open',
		title: 'Identity verified and the lists screened before an account opens',
		obligation:
			'No account opens for an applicant whose identity did not match the document or who was not screened; a list match is declined or referred for enhanced due diligence on the rule, and the risk is rated before the open.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-onboarding/policy/no-open-before-screening' },
			{ kind: 'evaluator', id: 'fs-onboarding/identity-before-open' },
			{ kind: 'evaluator', id: 'fs-onboarding/risk-rated-before-open' },
			{ kind: 'evaluator', id: 'fs-onboarding/decision-matches-rules' }
		],
		status: 'unreviewed',
		tags: ['mlr:kyc', 'mlr:screening']
	},
	{
		framework: 'POCA 2002 s.333A (tipping off)',
		ref: 'tipping-off',
		title: 'A screening match is never told to the applicant',
		obligation:
			'Nothing said to an applicant whose screening matched a list names the match, in any words; the decline is a decline and the referral a referral.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-onboarding/policy/a-hit-is-never-said' },
			{ kind: 'evaluator', id: 'fs-onboarding/hit-contained' }
		],
		status: 'unreviewed',
		tags: ['poca:tipping-off', 'mlr:screening']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A) / PRA SS1/23 principle 5',
		ref: 'welcome-and-four-eyes',
		title: 'The customer welcomed in plain words; the open under four eyes',
		obligation:
			'A new customer is told what happens next in words they can follow; an account opens only when a person has agreed.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-onboarding/policy/open-is-four-eyes' },
			{ kind: 'evaluator', id: 'fs-onboarding/risk-rated-before-open' }
		],
		status: 'unreviewed',
		tags: ['fca:cd:understanding', 'pra:ss1-23:mitigants']
	}
];

export const onboardingControlMap: ControlMap = {
	id: 'fs-onboarding/control-map',
	title: 'The Onboarding Desk',
	description:
		'The Onboarding Desk’s claims of relevance: identity and screening before an account opens, a match never told to the applicant, the open under four eyes with a plain welcome. Relevance, not compliance.',
	rows: [...ONBOARDING_CONTROL_ROWS]
};
