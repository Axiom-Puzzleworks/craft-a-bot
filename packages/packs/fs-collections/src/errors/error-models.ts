import type { ErrorModel } from '@craftabot/core';

/** The desk's error model's id: what a campaign's fallible brain names. */
export const COLLECTIONS_PLAN_ERROR_MODEL_ID = 'fs-collections/error/plan';

/**
 * **The desk's fallible actor** (WP154, `111-TESTABLE-CONTROLS-PLAN.md` §4):
 * the `offer-plan` call's `plan` wrong at `fs-bank`'s `collections-plan-error` rate, spread evenly over
 * the others. Everything else the plan does is played exactly, so an effect on
 * the decision is the decision's.
 */
export const collectionsErrorModels: ErrorModel[] = [
	{
		id: COLLECTIONS_PLAN_ERROR_MODEL_ID,
		name: 'A collections handler who offers the wrong plan one time in ten',
		description:
			'Plays the desk’s plan exactly, but the plan offered (a payment plan, reduced payments, breathing space) is another at the calibrated rate, drawn evenly.',
		faults: [
			{
				action: 'offer-plan',
				field: 'plan',
				options: ['payment-plan', 'reduced-payments', 'breathing-space'],
				rate: { table: 'fs-bank/error-rates', row: 'collections-plan-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
