import { disclosureMadeEvaluator } from '@craftabot/pack-fs-bank';

/** WP145: a declined loan's reasons go with the right to a review, in the bank's words. */
export const LENDING_DISCLOSURE_ID = 'fs-lending/review-right-disclosed';
export const lendingDisclosure = disclosureMadeEvaluator({
	id: LENDING_DISCLOSURE_ID,
	name: 'Review right disclosed',
	disclosure: 'lending/review-right',
	obliges: (calls) => {
		const declined = calls.some(
			(call) => call.ok && call.name === 'decide' && call.arguments['outcome'] === 'decline'
		);
		return declined ? calls.find((call) => call.ok && call.name === 'explain-decision') : undefined;
	}
});
