import type { ErrorModel } from '@craftabot/core';

/** The fraud desk's error model's id: what a campaign's fallible brain names. */
export const FRAUD_DECISION_ERROR_MODEL_ID = 'fs-fraud/error/alert-decision';

/**
 * **The fraud desk's fallible actor** (WP115, `103-FALLIBLE-ACTORS.md` §5):
 * the desk decides an alert by the action it calls, so the fault swaps the
 * action — `release` for `hold`, `freeze-account` for `release` — at
 * `fs-bank`'s `fraud-alert-decision-error` rate, spread evenly over the other
 * four. Every action takes the same `{ alertId, reason }`, so a swapped call is
 * one the desk can perform.
 */
export const fraudErrorModels: ErrorModel[] = [
	{
		id: FRAUD_DECISION_ERROR_MODEL_ID,
		name: 'A fraud handler who gets one alert in ten wrong',
		description:
			'Plays the desk’s plan exactly, but each alert’s decision (release, hold, block the card, freeze, escalate) is wrong at the calibrated rate, spread evenly over the other four.',
		faults: [
			{
				options: ['release', 'hold', 'block-card', 'freeze-account', 'escalate'],
				rate: { table: 'fs-bank/error-rates', row: 'fraud-alert-decision-error', key: 'wrong' },
				direction: 'uniform'
			}
		]
	}
];
