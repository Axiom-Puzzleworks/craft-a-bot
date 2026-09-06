import type { ControlMap, ControlMapRow } from '@craftabot/core';

/**
 * **The desk's control-map rows** (WP63 stage C, `52-FS-LENDING.md` §4.7;
 * `41-…` §6.7): the Lending Desk's claims of relevance, worded as such.
 * Data now; WP67 registers them. The bank's rows already name this desk's
 * `decision-matches-rules`, `explanation-faithful`, *No decision before
 * affordability* and *Cohort-blind*.
 */
export const LENDING_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'FCA CONC 5.2A',
		ref: 'affordability-first',
		title: 'Affordability and creditworthiness before a decision',
		obligation:
			'No decision before the worksheet is worked; the decision is the one the bank’s rules give, and a case the rules cannot decide is referred.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-lending/policy/no-decision-before-affordability' },
			{ kind: 'policy-card', id: 'fs-lending/policy/refer-when-the-rules-say-refer' },
			{ kind: 'evaluator', id: 'fs-lending/decision-matches-rules' },
			{ kind: 'evaluator', id: 'fs-lending/identity-before-decision' }
		],
		status: 'unreviewed',
		tags: ['fca:conc:affordability', 'fca:conc:creditworthiness', 'mlr:kyc']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A) / PRA SS1/23',
		ref: 'explanation',
		title: 'Decisions explained in the reasons actually used',
		obligation:
			'An explanation names only reasons the decision rested on, each with its evidence in hand when the decision was made; an appeal is logged and answered.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-lending/policy/reasons-are-real' },
			{ kind: 'evaluator', id: 'fs-lending/explanation-faithful' },
			{ kind: 'evaluator', id: 'fs-lending/appeal-handled' },
			{ kind: 'evaluator', id: 'fs-lending/rubric/understanding' }
		],
		status: 'unreviewed',
		tags: ['fca:cd:understanding', 'pra:ss1-23:governance']
	},
	{
		framework: 'Equality Act 2010',
		ref: 'cohort-blind',
		title: 'Decisions blind to cohort; outcomes compared across it',
		obligation:
			'A cohort attribute the journey never revealed never reaches the prompt a decision is made on; the matched pair decides identically; approval and over-decline rates are compared across cohorts.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-lending/policy/cohort-blind' },
			{ kind: 'gate', id: 'parity' },
			{ kind: 'evaluator', id: 'fs-lending/decision-matches-rules' }
		],
		status: 'unreviewed',
		tags: ['equality-act:fairness']
	},
	{
		framework: 'PRA SS1/23 principle 5',
		ref: 'four-eyes',
		title: 'Disbursement under four eyes',
		obligation: 'Money leaves the bank only when a person has agreed.',
		evidence: [{ kind: 'policy-card', id: 'fs-lending/policy/disbursement-is-four-eyes' }],
		status: 'unreviewed',
		tags: ['pra:ss1-23:mitigants']
	}
];

/** The rows as the map the manifest registers (WP67, `53-…` §4.1). */
export const lendingControlMap: ControlMap = {
	id: 'fs-lending/control-map',
	title: 'The Lending Desk',
	description:
		'The Lending Desk’s claims of relevance: affordability first, decisions explained in the reasons used, cohort-blind decisions compared across cohorts, four eyes on disbursement. Relevance, not compliance.',
	rows: [...LENDING_CONTROL_ROWS]
};
