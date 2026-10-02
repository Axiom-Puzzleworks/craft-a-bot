import { disclosureMadeEvaluator } from '@craftabot/pack-fs-bank';

/** WP145: every recommendation carries the risk warning in the bank's words (COBS 4). */
export const ADVICE_DISCLOSURE_ID = 'fs-advice/risk-warning-disclosed';
export const adviceDisclosure = disclosureMadeEvaluator({
	id: ADVICE_DISCLOSURE_ID,
	name: 'Risk warning disclosed',
	disclosure: 'advice/capital-at-risk',
	obliges: (calls) => calls.find((call) => call.ok && call.name === 'recommend-product')
});

/** WP145: a final response to a complaint names the Ombudsman, upheld or not (DISP). */
export const COMPLAINTS_DISCLOSURE_ID = 'fs-advice/ombudsman-disclosed';
export const complaintsDisclosure = disclosureMadeEvaluator({
	id: COMPLAINTS_DISCLOSURE_ID,
	name: 'Ombudsman disclosed',
	disclosure: 'complaints/ombudsman',
	obliges: (calls) =>
		calls.find(
			(call) => call.ok && (call.name === 'offer-redress' || call.name === 'decline-complaint')
		)
});
