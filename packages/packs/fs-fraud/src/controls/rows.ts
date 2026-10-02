import type { ControlMap, ControlMapRow } from '@craftabot/core';

/**
 * **The desk's control-map rows** (WP62 stage C, `51-FS-FRAUD.md` §4.7;
 * `41-…` §6.7): the Fraud Desk's claims of relevance, worded as such.
 * Data now; WP67 registers them. The bank's rows already name this desk's
 * `alert-decision`, `no-tip-off`, `caller-verified-before-action`,
 * *Never tip off* and the distressed-call rubric.
 */
export const FRAUD_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'POCA 2002 s.333A',
		ref: 'tipping-off',
		title: 'Never tip off',
		obligation:
			'A caller is never told that a report has been made or an investigation is under way; a report follows an escalation.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-fraud/policy/never-tip-off' },
			{ kind: 'policy-card', id: 'fs-fraud/policy/no-sar-without-escalation-first' },
			{ kind: 'evaluator', id: 'fs-fraud/no-tip-off' },
			{ kind: 'evaluator', id: 'fs-fraud/sar-after-escalation' }
		],
		status: 'unreviewed',
		tags: ['poca:tipping-off']
	},
	{
		framework: 'MLR 2017',
		ref: 'verify-before-acting',
		title: 'Verify before acting on a call',
		obligation:
			'Nothing is released, frozen or blocked for a caller the desk has not verified against the file.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-fraud/policy/verify-before-you-act-on-a-call' },
			{ kind: 'evaluator', id: 'fs-fraud/caller-verified-before-action' }
		],
		status: 'unreviewed',
		tags: ['mlr:kyc']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A)',
		ref: 'support',
		title: 'Consumer support on a call',
		obligation:
			'A distressed caller is treated with courtesy; a coached customer is warned in plain words; a social engineer is refused firmly.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-fraud/scam-warning-given' },
			{ kind: 'evaluator', id: 'fs-fraud/rubric/distressed-call' },
			{ kind: 'evaluator', id: 'fs-fraud/rubric/social-engineering-call' }
		],
		status: 'unreviewed',
		tags: ['fca:cd:support', 'fca:fg21-1:vulnerability']
	},
	{
		framework: 'Equality Act 2010',
		ref: 'fairness',
		title: 'No cohort frozen more than another',
		obligation:
			'The false-freeze rate is compared across cohorts read from truth; the parity gate says whether the cohorts were matched.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-fraud/alert-decision', note: 'the fp label rate, by cohort' },
			{ kind: 'gate', id: 'parity' }
		],
		status: 'unreviewed',
		tags: ['equality-act:fairness']
	},
	{
		framework: 'PRA SS1/23',
		ref: 'mitigants',
		title: 'A person on every freeze',
		obligation: 'The irreversible decision is paused for a person; the approval load is measured.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-fraud/policy/freeze-needs-a-second-look' },
			{ kind: 'evaluator', id: 'fs-fraud/approval-load' },
			{ kind: 'trace-guarantee', id: 'approval.requested' },
			// WP137: the gate on the journey's irreversible stage.
			{ kind: 'policy-card', id: 'fs-fraud/policy/sar-waits-for-the-file' }
		],
		status: 'unreviewed',
		tags: ['pra:ss1-23:mitigants']
	},
	{
		framework: 'PRA SS1/21',
		ref: 'resilience',
		title: 'Under load, escalate',
		obligation:
			'A queue the desk cannot work in its budget is escalated, never released to clear it.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-fraud/queue-decisions' },
			{ kind: 'evaluator', id: 'fs-fraud/time-to-decision' }
		],
		status: 'unreviewed',
		tags: ['pra:ss1-21:resilience']
	},
	{
		// WP135 (`110-…` G107): the card had shipped with no row citing it.
		framework: 'OWASP Agentic Top 10 (ASI01) and Consumer Duty',
		ref: 'records-are-data',
		title: 'An instruction in a record is not obeyed',
		obligation:
			'A release, an unfreeze or a contact that a note on the record asks for is not acted on by the bot; a person decides.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-fraud/policy/no-auto-release-from-instructions-in-records' }
		],
		status: 'unreviewed',
		tags: ['ASI01', 'fca:cd:support']
	}
];

/** The rows as the map the manifest registers (WP67, `53-…` §4.1). */
export const fraudControlMap: ControlMap = {
	id: 'fs-fraud/control-map',
	title: 'The Fraud Desk',
	description:
		'The Fraud Desk’s claims of relevance: tipping off, verification before acting, the support outcome on a call, fairness across cohorts. Relevance, not compliance.',
	rows: [...FRAUD_CONTROL_ROWS]
};
