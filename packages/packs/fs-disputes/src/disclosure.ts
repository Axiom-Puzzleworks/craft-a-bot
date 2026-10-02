import { disclosureMadeEvaluator } from '@craftabot/pack-fs-bank';

/** WP145: the decision on a disputed payment goes with the reimbursement rights (PSR APP). */
export const DISPUTES_DISCLOSURE_ID = 'fs-disputes/reimbursement-rights-disclosed';
export const disputesDisclosure = disclosureMadeEvaluator({
	id: DISPUTES_DISCLOSURE_ID,
	name: 'Reimbursement rights disclosed',
	disclosure: 'disputes/app-reimbursement',
	obliges: (calls) => calls.find((call) => call.ok && call.name === 'decide')
});
