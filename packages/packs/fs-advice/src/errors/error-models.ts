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

/** The complaints desk's error model's id (WP154): the root cause recorded wrongly. */
export const COMPLAINTS_ROOT_CAUSE_ERROR_MODEL_ID = 'fs-advice/error/complaints-root-cause';

/**
 * **The complaints desk's fallible actor** (WP154, `111-…` §4): the
 * `find-root-cause` call's `cause` is another of the four at `fs-bank`'s
 * `complaints-root-cause-error` rate. The redress is played as the plan has
 * it; the register's root-cause card is what can catch the slip.
 */
export const complaintsErrorModels: ErrorModel[] = [
	{
		id: COMPLAINTS_ROOT_CAUSE_ERROR_MODEL_ID,
		name: 'A complaints handler who records the wrong root cause one time in ten',
		description:
			'Plays the desk’s plan exactly, but the root cause recorded is another of the four at the calibrated rate, drawn evenly.',
		faults: [
			{
				action: 'find-root-cause',
				field: 'cause',
				options: ['charges', 'advice', 'service', 'no-error'],
				rate: { table: 'fs-bank/error-rates', row: 'complaints-root-cause-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
