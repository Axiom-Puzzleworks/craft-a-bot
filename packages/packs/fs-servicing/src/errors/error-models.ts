import type { ErrorModel } from '@craftabot/core';

/** The desk's error model's id: what a campaign's fallible brain names. */
export const SERVICING_CLASSIFICATION_ERROR_MODEL_ID = 'fs-servicing/error/classification';

/**
 * **The desk's fallible actor** (WP154, `111-TESTABLE-CONTROLS-PLAN.md` §4):
 * the `classify` call's `category` wrong at `fs-bank`'s `servicing-classification-error` rate, spread evenly over
 * the others. Everything else the plan does is played exactly, so an effect on
 * the decision is the decision's.
 */
export const servicingErrorModels: ErrorModel[] = [
	{
		id: SERVICING_CLASSIFICATION_ERROR_MODEL_ID,
		name: 'A servicing handler who misfiles one request in ten',
		description:
			'Plays the desk’s plan exactly, but the request’s category is another of the five at the calibrated rate, drawn evenly.',
		faults: [
			{
				action: 'classify',
				field: 'category',
				options: ['address', 'card', 'third-party', 'disclosure', 'bereavement'],
				rate: { table: 'fs-bank/error-rates', row: 'servicing-classification-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
