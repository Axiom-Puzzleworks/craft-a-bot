import type { ControlMap, ControlMapRow } from '@craftabot/core';

/**
 * **The desk's control-map rows** (WP60 stage C, `49-FS-ADVICE.md` §4.6;
 * `41-…` §6.7): the Advice Desk's claims of relevance, worded as such —
 * "this obligation is evidenced by these ids". Data now; WP67 registers
 * them. The bank's rows already name this desk's ids; these are the
 * desk's own, finer rows.
 */
export const ADVICE_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'FCA COBS 9',
		ref: 'suitability',
		title: 'Suitability before a recommendation',
		obligation: 'The five things suitability needs are gathered before anything is recommended.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-advice/policy/no-recommendation-before-suitability' },
			{ kind: 'evaluator', id: 'fs-advice/suitability-complete' },
			{
				kind: 'evaluator',
				id: 'fs-advice/recommendation-suitable',
				note: 'against the truth’s suitable set'
			}
		],
		status: 'unreviewed',
		tags: ['fca:cobs-9:suitability', 'fca:cd:products-services']
	},
	{
		framework: 'FCA COBS 4',
		ref: 'promotions',
		title: 'Fair, clear, not misleading; warnings prominent',
		obligation: 'No guarantee language; the risk warning rides with every recommendation.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-advice/policy/no-guarantees' },
			{ kind: 'policy-card', id: 'fs-advice/policy/risk-warning-rides-with-every-recommendation' },
			{ kind: 'evaluator', id: 'fs-advice/no-guarantee-language' },
			{ kind: 'evaluator', id: 'fs-advice/warning-given' },
			{ kind: 'evaluator', id: 'fs-advice/rubric/understanding', note: 'the paraphrases' }
		],
		status: 'unreviewed',
		tags: ['fca:cobs-4:promotions', 'fca:cd:understanding']
	},
	{
		framework: 'FCA FG21/1',
		ref: 'vulnerability',
		title: 'Vulnerability recognised and actioned',
		obligation:
			'A disclosure is followed by a referral; nothing is executed for a customer who has disclosed.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-advice/policy/vulnerability-means-refer' },
			{ kind: 'evaluator', id: 'fs-advice/vulnerability-actioned' },
			{ kind: 'evaluator', id: 'fs-advice/rubric/support' }
		],
		status: 'unreviewed',
		tags: ['fca:fg21-1:vulnerability', 'fca:cd:support']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A)',
		ref: 'price-value',
		title: 'Price and value',
		obligation: 'Where a cheaper suitable product exists, charges are explained.',
		evidence: [{ kind: 'evaluator', id: 'fs-advice/rubric/price-value' }],
		status: 'unreviewed',
		tags: ['fca:cd:price-value']
	},
	{
		// WP135 (`110-…` G107): the framework named — the FCA's perimeter guidance on advising, and its guidance on
		// streamlined advice, which draws the line between guidance and a personal recommendation.
		framework: 'FCA PERG 8 and FG17/8 (the advice boundary)',
		ref: 'advice-boundary',
		title: 'Guidance is not advice',
		obligation: 'On a guidance-only card the desk explains and refers; it never recommends.',
		evidence: [{ kind: 'evaluator', id: 'fs-advice/boundary-held' }],
		status: 'unreviewed',
		tags: ['fca:cobs-9:suitability']
	},
	{
		framework: 'PRA SS1/23',
		ref: 'mitigants',
		title: 'A person on every execution',
		obligation: 'Money moves only after a person has approved it, at any autonomy.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-advice/policy/four-eyes-on-execution' },
			{ kind: 'trace-guarantee', id: 'approval.requested' },
			// WP135 (`110-…` G107): the evaluator that judges the approval happened, uncited until now.
			{ kind: 'evaluator', id: 'fs-advice/execution-approved' },
			// WP137: the gate on the journey's irreversible stage.
			{ kind: 'policy-card', id: 'fs-advice/policy/execution-waits-for-the-file' }
		],
		status: 'unreviewed',
		tags: ['pra:ss1-23:mitigants']
	},
	{
		framework: 'UK GDPR',
		ref: 'minimisation-and-purpose',
		title: 'Data minimisation and purpose limitation',
		obligation:
			'Identifiers are never read out; the special-category record is read only after a disclosure.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-advice/policy/pii-stays-on-the-desk' },
			{ kind: 'policy-card', id: 'fs-advice/policy/purpose-limited-lookup' },
			{ kind: 'evaluator', id: 'fs-advice/pii-contained' },
			{ kind: 'evaluator', id: 'fs-advice/data-minimised' }
		],
		status: 'unreviewed',
		tags: ['ukgdpr:data-minimisation', 'ukgdpr:purpose-limitation']
	},
	{
		// WP145 (`110-…` §10): what the customer must be told, said in the bank's words and digested on the trace.
		framework: 'FCA COBS 4',
		ref: 'risk-warning-disclosed',
		title: 'Every recommendation carries the risk warning in the bank’s words',
		obligation:
			'The capital-at-risk warning is said with every investment recommendation, in the registered wording.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/risk-warning-disclosed' },
			{ kind: 'trace-guarantee', id: 'disclosure.given' }
		],
		status: 'unreviewed',
		tags: ['fca:cobs-4:promotions', 'fca:cd:understanding']
	},
	{
		// WP145 (`110-…` §10): what the customer must be told, said in the bank's words and digested on the trace.
		framework: 'FCA DISP 1.6',
		ref: 'ombudsman-disclosed',
		title: 'A final response names the Financial Ombudsman Service',
		obligation:
			'Every final response to a complaint, upheld or not, tells the customer they can refer it to the Ombudsman, free, within six months.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/ombudsman-disclosed' },
			{ kind: 'trace-guarantee', id: 'disclosure.given' }
		],
		status: 'unreviewed',
		tags: ['fca:disp:complaints']
	},
	{
		// WP146 (`110-…` §10): DISP's timescales as deadlines on the complaints journey.
		framework: 'FCA DISP 1.6',
		ref: 'complaints-on-time',
		title: 'A complaint is acknowledged and answered within its timescales',
		obligation:
			'The acknowledgement and the final response carry DISP’s deadlines; a complaint past one is recorded overdue and escalated to a person.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/complaint-acknowledged' },
			{ kind: 'gate', id: 'timeliness' },
			{ kind: 'trace-guarantee', id: 'stage.overdue' }
		],
		status: 'unreviewed',
		tags: ['fca:disp:complaints']
	}
];

/** The rows as the map the manifest registers (WP67, `53-…` §4.1). */
export const adviceControlMap: ControlMap = {
	id: 'fs-advice/control-map',
	title: 'The Advice Desk',
	description:
		'The Advice Desk’s claims of relevance: suitability, promotions, vulnerability, data minimisation, four eyes on execution. Relevance, not compliance.',
	rows: [...ADVICE_CONTROL_ROWS]
};
