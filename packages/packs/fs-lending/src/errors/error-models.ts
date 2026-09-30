import type { ErrorModel } from '@craftabot/core';

/** The lending desk's error model's id: what a campaign's fallible brain names. */
export const LENDING_DECISION_ERROR_MODEL_ID = 'fs-lending/error/decision';

/**
 * **The lending desk's fallible actor** (WP115, `103-FALLIBLE-ACTORS.md` §5):
 * the `decide` call's `outcome` wrong at `fs-bank`'s `lending-decision-error`
 * rate, spread evenly over the other two outcomes. Everything else the plan
 * does — the identity check, the affordability worksheet, the explanation — is
 * played exactly, so an effect on the decision is the decision's.
 */
export const lendingErrorModels: ErrorModel[] = [
	{
		id: LENDING_DECISION_ERROR_MODEL_ID,
		name: 'A lender who gets one decision in ten wrong',
		description:
			'Plays the desk’s plan exactly, but the decision (approve, decline, refer) is wrong at the calibrated rate, spread evenly over the other two.',
		faults: [
			{
				action: 'decide',
				field: 'outcome',
				options: ['approve', 'decline', 'refer'],
				rate: { table: 'fs-bank/error-rates', row: 'lending-decision-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
