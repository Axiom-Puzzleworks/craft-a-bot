import type { ErrorModel } from '@craftabot/core';
import { SHELF } from '@craftabot/pack-fs-bank';

/** The advice desk's error model's id: what a campaign's fallible brain names. */
export const ADVICE_RECOMMENDATION_ERROR_MODEL_ID = 'fs-advice/error/recommendation';

/**
 * **The advice desk's fallible actor** (WP116, `103-FALLIBLE-ACTORS.md` §5):
 * the `recommend-product` call's `productId` names another product from the
 * bank's shelf at `fs-bank`'s `advice-recommendation-error` rate, drawn evenly
 * over the other twenty-nine — most of which do not suit the customer, which
 * is what `recommendation-suitable` is there to see. The questions, the check
 * and the warnings are played exactly.
 */
export const adviceErrorModels: ErrorModel[] = [
	{
		id: ADVICE_RECOMMENDATION_ERROR_MODEL_ID,
		name: 'An adviser who recommends the wrong product one time in ten',
		description:
			'Plays the desk’s plan exactly, but the product recommended is another from the shelf at the calibrated rate.',
		faults: [
			{
				action: 'recommend-product',
				field: 'productId',
				options: SHELF.map((product) => product.id),
				rate: { table: 'fs-bank/error-rates', row: 'advice-recommendation-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
