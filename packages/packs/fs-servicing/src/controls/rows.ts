import type { ControlMap, ControlMapRow } from '@craftabot/core';

/**
 * **The desk's control-map rows** (WP106, `92-FS-SERVICING.md` §4; `41-…`
 * §6.7): the Servicing Desk's claims of relevance, worded as such — FG21/1's
 * disclosure recorded and acted on, UK GDPR's purpose limitation on the
 * file, the Consumer Duty's support. Relevance, not compliance; every row
 * `unreviewed` until a compliance reader has read it.
 */
export const SERVICING_CONTROL_ROWS: readonly ControlMapRow[] = [
	{
		framework: 'FCA FG21/1 (vulnerable customers)',
		ref: 'disclosure-recorded',
		title: 'A support need disclosed on a call is recorded as said, before the desk acts',
		obligation:
			'What a caller discloses of a bereavement, a job loss or a health condition goes on the file in their words before the request is acted on, and travels with the customer to the desk that needs it.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-servicing/policy/record-a-disclosure' },
			{ kind: 'evaluator', id: 'fs-servicing/disclosure-recorded' }
		],
		status: 'unreviewed',
		tags: ['fca:fg21-1:vulnerability']
	},
	{
		framework: 'UK GDPR (purpose limitation, data minimisation)',
		ref: 'verify-and-purpose',
		title:
			'The file changed only for a verified caller, only as the request calls for, access only on an authority',
		obligation:
			'Nothing on the file changes for a caller who did not match it; a request changes what it asks and nothing else; a third party has access only on an authority the file carries.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-servicing/policy/verify-before-act' },
			{ kind: 'policy-card', id: 'fs-servicing/policy/access-on-an-authority' },
			{ kind: 'evaluator', id: 'fs-servicing/verified-before-act' },
			{ kind: 'evaluator', id: 'fs-servicing/needs-met' }
		],
		status: 'unreviewed',
		tags: ['ukgdpr:purpose-limitation', 'ukgdpr:data-minimisation', 'mlr:kyc']
	},
	{
		framework: 'FCA Consumer Duty (PRIN 2A) — consumer support / PRA SS1/23 principle 5',
		ref: 'served-and-four-eyes',
		title: 'The request understood and met; a closure under four eyes',
		obligation:
			'A request is classified as the caller meant it and met with the act it calls for; an account closes only when a person has agreed.',
		evidence: [
			{ kind: 'policy-card', id: 'fs-servicing/policy/closure-is-four-eyes' },
			{ kind: 'evaluator', id: 'fs-servicing/classified-correctly' },
			{ kind: 'evaluator', id: 'fs-servicing/needs-met' }
		],
		status: 'unreviewed',
		tags: ['fca:cd:support', 'pra:ss1-23:mitigants']
	}
];

export const servicingControlMap: ControlMap = {
	id: 'fs-servicing/control-map',
	title: 'The Servicing Desk',
	description:
		'The Servicing Desk’s claims of relevance: a disclosure recorded as said before the act, the file changed only for a verified caller and only as the request calls for, access on an authority, a closure under four eyes. Relevance, not compliance.',
	rows: [...SERVICING_CONTROL_ROWS]
};
