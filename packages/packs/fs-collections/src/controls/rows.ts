import type { ControlMap, ControlMapRow } from '@craftabot/core';

/**
 * **The desk's control-map rows** (WP105, `91-FS-COLLECTIONS.md` §4; `41-…`
 * §6.7): the Collections Desk's claims of relevance, worded as such — CONC
 * 7's forbearance and due consideration, FG21/1's treatment of a disclosed
 * support need, the Consumer Duty's support. Relevance, not compliance;
 * every row `unreviewed` until a compliance reader has read it.
 */
export const COLLECTIONS_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'FCA CONC 7 (arrears, default and recovery)',
		ref: 'forbearance-on-the-rule',
		title: 'Circumstances heard before a plan; forbearance where the rule offers it',
		obligation:
			'A customer in arrears is asked about their circumstances before any plan is put to them; the plan is the one the rule gives for what they can afford — a payment plan, reduced payments, or breathing space; a default notice never precedes the circumstances.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-collections/policy/circumstances-before-the-plan' },
			{ kind: 'policy-card', id: 'fs-collections/policy/no-default-notice-before-circumstances' },
			{ kind: 'evaluator', id: 'fs-collections/circumstances-before-plan' },
			{ kind: 'evaluator', id: 'fs-collections/plan-matches-rule' },
			{ kind: 'evaluator', id: 'fs-collections/no-notice-before-circumstances' }
		],
		status: 'unreviewed',
		tags: ['fca:conc-7:arrears']
	},
	{
		framework: 'FCA FG21/1 (vulnerable customers)',
		ref: 'disclosure-actioned',
		title: 'A disclosed support need recorded as said, and acted on',
		obligation:
			'What a customer discloses of their health, their work or their life is recorded in their words before the desk acts; a disclosed support need is met with forbearance and stops a notice, and needs no proving.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-collections/policy/forbearance-where-the-rule-offers-it' },
			{ kind: 'policy-card', id: 'fs-collections/policy/no-default-notice-before-circumstances' },
			{ kind: 'evaluator', id: 'fs-collections/vulnerability-actioned' }
		],
		status: 'unreviewed',
		tags: ['fca:fg21-1:vulnerability', 'fca:cd:support']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A) / PRA SS1/23 principle 5',
		ref: 'plan-understood-and-four-eyes',
		title: 'The plan explained in plain words; agreed under four eyes',
		obligation:
			'A customer is told what the plan asks each month in words they can follow; a plan — a contract on the account — is agreed only when a person has confirmed it.',
		evidence: [{ kind: 'policy-card', id: 'fs-collections/policy/a-plan-is-four-eyes' }],
		status: 'unreviewed',
		tags: ['fca:cd:understanding', 'pra:ss1-23:mitigants']
	}
];

export const collectionsControlMap: ControlMap = {
	id: 'fs-collections/control-map',
	title: 'The Collections Desk',
	description:
		'The Collections Desk’s claims of relevance: the circumstances heard before a plan, forbearance where the rule offers it, a disclosed support need recorded and acted on, no default notice before the circumstances, the plan under four eyes. Relevance, not compliance.',
	rows: [...COLLECTIONS_CONTROL_ROWS]
};
