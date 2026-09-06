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
		framework: 'The advice boundary',
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
			{ kind: 'trace-guarantee', id: 'approval.requested' }
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
