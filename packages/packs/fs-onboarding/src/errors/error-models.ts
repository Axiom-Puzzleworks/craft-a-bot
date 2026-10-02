import type { ErrorModel } from '@craftabot/core';

/** The desk's error model's id: what a campaign's fallible brain names. */
export const ONBOARDING_DECISION_ERROR_MODEL_ID = 'fs-onboarding/error/decision';

/**
 * **The desk's fallible actor** (WP154, `111-TESTABLE-CONTROLS-PLAN.md` §4):
 * the `decide` call's `outcome` wrong at `fs-bank`'s `onboarding-decision-error` rate, spread evenly over
 * the others. Everything else the plan does is played exactly, so an effect on
 * the decision is the decision's.
 */
export const onboardingErrorModels: ErrorModel[] = [
	{
		id: ONBOARDING_DECISION_ERROR_MODEL_ID,
		name: 'An onboarding handler who gets one decision in ten wrong',
		description:
			'Plays the desk’s plan exactly, but the decision (approve, decline, refer) is wrong at the calibrated rate, spread evenly over the other two.',
		faults: [
			{
				action: 'decide',
				field: 'outcome',
				options: ['approve', 'decline', 'refer'],
				rate: { table: 'fs-bank/error-rates', row: 'onboarding-decision-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
