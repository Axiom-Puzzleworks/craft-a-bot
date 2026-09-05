/**
 * **The bank's control-map rows** (WP59 stage B, `48-FS-BANK.md` §4.7;
 * `41-…` §6.7): the UK retail rows, shipped as data now and registered by
 * WP67 when `PackManifest.controlMaps` and `checkControlMap` exist. Each
 * row is a *claim of relevance* — "this obligation is evidenced by these
 * ids" — worded as such; none is a claim of compliance. The evidence ids
 * are the ones the desks will use, decided here so WP67 can resolve them.
 */
export type ControlEvidenceKind =
	| 'guardrail'
	| 'policy-card'
	| 'evaluator'
	| 'gate'
	| 'trace-guarantee'
	| 'egress'
	| 'principal'
	| 'artefact';

export interface ControlMapRow {
	framework: string;
	ref: string;
	title: string;
	obligation: string;
	evidence: Array<{ kind: ControlEvidenceKind; id: string; note?: string }>;
	/** The obligation tags this row groups (`obligations.ts`). */
	tags: string[];
}

export const BANK_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'FCA Consumer Duty (PRIN 2A)',
		ref: 'products-services',
		title: 'Products and services',
		obligation:
			'A recommendation is within the product’s target market and suits the customer it is made to.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/recommendation-suitable' },
			{ kind: 'evaluator', id: 'fs-advice/rubric/products-services' }
		],
		tags: ['fca:cd:products-services']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A)',
		ref: 'price-value',
		title: 'Price and value',
		obligation:
			'Where a cheaper suitable product exists, it is surfaced and charges are explained.',
		evidence: [{ kind: 'evaluator', id: 'fs-advice/rubric/price-value' }],
		tags: ['fca:cd:price-value']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A)',
		ref: 'understanding',
		title: 'Consumer understanding',
		obligation:
			'Explanations a first-timer can follow; decisions explained with the reasons actually used.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/rubric/understanding' },
			{ kind: 'evaluator', id: 'fs-lending/explanation-faithful' }
		],
		tags: ['fca:cd:understanding']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A)',
		ref: 'support',
		title: 'Consumer support',
		obligation:
			'Tone and help after a disclosure and under pressure; calls handled with courtesy and firmness.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/rubric/support' },
			{ kind: 'evaluator', id: 'fs-fraud/rubric/distressed-call' }
		],
		tags: ['fca:cd:support']
	},
	{
		framework: 'FCA COBS 9 / COBS 4',
		ref: 'suitability-and-promotions',
		title: 'Suitability before advice; promotions fair, clear, not misleading',
		obligation:
			'No recommendation before suitability is gathered; no guarantee language; the risk warning rides with every recommendation.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/suitability-complete' },
			{ kind: 'policy-card', id: 'fs-advice/policy/no-recommendation-before-suitability' },
			{ kind: 'policy-card', id: 'fs-advice/policy/no-guarantees' },
			{ kind: 'evaluator', id: 'fs-advice/warning-given' }
		],
		tags: ['fca:cobs-9:suitability', 'fca:cobs-4:promotions']
	},
	{
		framework: 'FCA CONC',
		ref: 'affordability',
		title: 'Affordability and creditworthiness before a decision',
		obligation:
			'A lending decision follows an affordability assessment and is explained on decline.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-lending/decision-matches-rules' },
			{ kind: 'policy-card', id: 'fs-lending/policy/no-decision-before-affordability' },
			{ kind: 'evaluator', id: 'fs-lending/explanation-faithful' }
		],
		tags: ['fca:conc:affordability', 'fca:conc:creditworthiness']
	},
	{
		framework: 'FCA FG21/1',
		ref: 'vulnerability',
		title: 'Vulnerable customers recognised and actioned',
		obligation:
			'A disclosed vulnerability is acted on; special-category data is read only for that purpose.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/vulnerability-actioned' },
			{ kind: 'evaluator', id: 'fs-advice/data-minimised' },
			{ kind: 'policy-card', id: 'fs-advice/policy/purpose-limited-lookup' }
		],
		tags: ['fca:fg21-1:vulnerability', 'ukgdpr:purpose-limitation']
	},
	{
		framework: 'FCA DISP',
		ref: 'complaints',
		title: 'Complaints acknowledged, root-caused, redressed within bounds',
		obligation:
			'A complaint is logged, acknowledged, answered with a reason and redressed within the rules.',
		evidence: [{ kind: 'evaluator', id: 'fs-advice/complaint-handled' }],
		tags: ['fca:disp:complaints']
	},
	{
		framework: 'PRA SS1/23',
		ref: 'model-risk',
		title: 'Model risk management principles',
		obligation:
			'Every bot has an inventory entry; approvals are recorded; campaigns are the test evidence; validation is independent; mitigants are in place.',
		evidence: [
			{ kind: 'artefact', id: 'agent-card', note: 'the inventory entry' },
			{ kind: 'artefact', id: 'kit-file-requires' },
			{ kind: 'trace-guarantee', id: 'approval.requested' },
			{ kind: 'artefact', id: 'campaign-report', note: 'with builds and no-regression gates' },
			{ kind: 'gate', id: 'no-regression' }
		],
		tags: [
			'pra:ss1-23:identification',
			'pra:ss1-23:governance',
			'pra:ss1-23:development',
			'pra:ss1-23:validation',
			'pra:ss1-23:mitigants'
		]
	},
	{
		framework: 'POCA / MLR 2017',
		ref: 'tipping-off-and-kyc',
		title: 'Never tip off; verify before acting',
		obligation:
			'A customer is never told about a SAR; identity is verified before a payment is released or an account changed.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-fraud/no-tip-off' },
			{ kind: 'policy-card', id: 'fs-fraud/policy/never-tip-off' },
			{ kind: 'evaluator', id: 'fs-fraud/caller-verified-before-action' }
		],
		tags: ['poca:tipping-off', 'mlr:kyc']
	},
	{
		framework: 'UK GDPR',
		ref: 'data-minimisation',
		title: 'Data minimisation and purpose limitation',
		obligation:
			'Records are read only for the purpose; special-category records are gated by purpose on every line.',
		evidence: [
			{ kind: 'evaluator', id: 'fs-advice/data-minimised' },
			{ kind: 'policy-card', id: 'fs-advice/policy/purpose-limited-lookup' },
			{ kind: 'trace-guarantee', id: 'tool.executed', note: 'every line read is on the trace' }
		],
		tags: ['ukgdpr:data-minimisation', 'ukgdpr:purpose-limitation']
	},
	{
		framework: 'Equality Act 2010',
		ref: 'fairness',
		title: 'Outcomes compared across cohorts',
		obligation:
			'Approval and decline rates are compared across cohorts; a cohort attribute never reaches the prompt unless the journey revealed it.',
		evidence: [
			{ kind: 'gate', id: 'parity' },
			{ kind: 'policy-card', id: 'fs-lending/policy/cohort-blind' }
		],
		tags: ['equality-act:fairness']
	},
	{
		framework: 'PRA SS1/21',
		ref: 'resilience',
		title: 'Degraded service handled safely and told plainly',
		obligation:
			'When the model degrades the customer is told in plain words rather than given a wrong answer.',
		evidence: [{ kind: 'policy-card', id: 'fs-bank/policy/fallback' }],
		tags: ['pra:ss1-21:resilience']
	}
];
