import type { ControlMap, ControlMapRow } from '@craftabot/core';

/**
 * **The desk's control-map rows** (WP104, `90-FS-DISPUTES.md` §4; `41-…`
 * §6.7): the Disputes Desk's claims of relevance, worded as such — the
 * PSR's APP reimbursement requirement, the Consumer Duty's support. Relevance,
 * not compliance; every row `unreviewed` until a compliance reader has read it.
 */
export const DISPUTES_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'PSR APP fraud reimbursement requirement (2024) / PSRs 2017 reg. 76',
		ref: 'reimbursement-on-the-rule',
		title: 'A dispute classified, investigated and reimbursed on the rule, within the limit',
		obligation:
			'An unauthorised payment is reimbursed; an authorised push-payment scam is reimbursed less the excess up to the limit and referred above it; a merchant dispute is not a fraud claim; nothing is paid before the hold and the investigation.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-disputes/policy/classify-before-deciding' },
			{ kind: 'policy-card', id: 'fs-disputes/policy/no-reimbursement-before-investigation' },
			{ kind: 'policy-card', id: 'fs-disputes/policy/within-the-limit' },
			{ kind: 'evaluator', id: 'fs-disputes/classified-before-decision' },
			{ kind: 'evaluator', id: 'fs-disputes/reimbursed-within-limit' },
			{ kind: 'evaluator', id: 'fs-disputes/decision-matches-rules' }
		],
		status: 'unreviewed',
		tags: ['psr:app-reimbursement']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A) — consumer support',
		ref: 'support-under-pressure',
		title: 'A frightened customer supported, and the hold explained, not skipped',
		obligation:
			'A customer who has been scammed is told what happens and when, in plain words; pressure to release does not move the hold or the investigation.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-disputes/policy/no-reimbursement-before-investigation' },
			{ kind: 'evaluator', id: 'fs-disputes/hold-before-investigation' }
		],
		status: 'unreviewed',
		tags: ['fca:cd:support', 'fca:cd:understanding']
	},
	{
		framework: 'PRA SS1/23 principle 5',
		ref: 'reimbursement-four-eyes',
		title: 'The reimbursement under four eyes',
		obligation: 'Money is paid only when a person has agreed.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-disputes/policy/reimbursement-is-four-eyes' },
			// WP137: the gate on the journey's irreversible stage.
			{ kind: 'policy-card', id: 'fs-disputes/policy/reimbursement-waits-for-the-file' }
		],
		status: 'unreviewed',
		tags: ['pra:ss1-23:mitigants']
	},
	{
		// WP145 (`110-…` §10): what the customer must be told, said in the bank's words and digested on the trace.
		framework: 'PSR APP reimbursement requirement',
		ref: 'reimbursement-rights',
		title: 'The customer is told their reimbursement rights with the decision',
		obligation:
			'The decision on a disputed payment goes with the reimbursement rights, the limit and the excess, in writing.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-disputes/reimbursement-rights-disclosed' },
			{ kind: 'trace-guarantee', id: 'disclosure.given' }
		],
		status: 'unreviewed',
		tags: ['psr:app-reimbursement', 'fca:cd:understanding']
	},
	{
		// WP146 (`110-…` §10): the reimbursement inside its timescale, measured by the clock.
		framework: 'PSR APP reimbursement requirement',
		ref: 'reimbursement-on-time',
		title: 'A reimbursement is made within its timescale, and a late one is escalated',
		obligation:
			'The reimbursement stage carries a deadline; a journey past it is recorded overdue and escalated to a person.',
		evidence: [
			{ kind: 'gate', id: 'timeliness' },
			{ kind: 'trace-guarantee', id: 'stage.overdue' }
		],
		status: 'unreviewed',
		tags: ['psr:app-reimbursement']
	}
];

export const disputesControlMap: ControlMap = {
	id: 'fs-disputes/control-map',
	title: 'The Disputes Desk',
	description:
		'The Disputes Desk’s claims of relevance: a dispute classified, held and investigated before it is decided, reimbursed on the rule within the limit, the customer supported under pressure, the payment under four eyes. Relevance, not compliance.',
	rows: [...DISPUTES_CONTROL_ROWS]
};
