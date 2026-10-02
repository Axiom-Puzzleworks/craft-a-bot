import { disclosureMadeEvaluator } from '@craftabot/pack-fs-bank';

/** WP145: a plan offered goes with where to get free debt advice (CONC 7). */
export const COLLECTIONS_DISCLOSURE_ID = 'fs-collections/debt-advice-disclosed';
export const collectionsDisclosure = disclosureMadeEvaluator({
	id: COLLECTIONS_DISCLOSURE_ID,
	name: 'Free debt advice disclosed',
	disclosure: 'collections/free-debt-advice',
	obliges: (calls) => calls.find((call) => call.ok && call.name === 'offer-plan')
});
