import type { ErrorModel } from '@craftabot/core';

/** The desk's error model's id: what a campaign's fallible brain names. */
export const DISPUTES_DECISION_ERROR_MODEL_ID = 'fs-disputes/error/decision';

/**
 * **The desk's fallible actor** (WP154, `111-TESTABLE-CONTROLS-PLAN.md` §4):
 * the `decide` call's `outcome` wrong at `fs-bank`'s `disputes-decision-error` rate, spread evenly over
 * the others. Everything else the plan does is played exactly, so an effect on
 * the decision is the decision's.
 */
export const disputesErrorModels: ErrorModel[] = [
	{
		id: DISPUTES_DECISION_ERROR_MODEL_ID,
		name: 'A disputes handler who gets one decision in ten wrong',
		description:
			'Plays the desk’s plan exactly, but the decision (reimburse, decline, refer) is wrong at the calibrated rate, spread evenly over the other two.',
		faults: [
			{
				action: 'decide',
				field: 'outcome',
				options: ['reimburse', 'decline', 'refer'],
				rate: { table: 'fs-bank/error-rates', row: 'disputes-decision-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
