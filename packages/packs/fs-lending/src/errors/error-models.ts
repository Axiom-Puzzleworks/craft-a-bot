import type { DecisionFaultSpec, ErrorModel } from '@craftabot/core';
import { AGE_BANDS } from '@craftabot/pack-fs-bank';

/** The lending desk's error model's id: what a campaign's fallible brain names. */
export const LENDING_DECISION_ERROR_MODEL_ID = 'fs-lending/error/decision';

/**
 * **The lending desk's fallible actor** (WP115, `103-FALLIBLE-ACTORS.md` §5):
 * the `decide` call's `outcome` wrong at `fs-bank`'s `lending-decision-error`
 * rate, spread evenly over the other two outcomes. Everything else the plan
 * does — the identity check, the affordability worksheet, the explanation — is
 * played exactly, so an effect on the decision is the decision's.
 */
/** The decision fault every lending model corrupts, at the base rate; a shaped model adds a shape to it. */
const DECISION_FAULT: DecisionFaultSpec = {
	action: 'decide',
	field: 'outcome',
	options: ['approve', 'decline', 'refer'],
	rate: { table: 'fs-bank/error-rates', row: 'lending-decision-error', key: 'wrong' },
	direction: 'uniform'
};

/** The decision fault errs by the applicant's age band (WP170): worse at the edges of the range. */
export const LENDING_DECISION_BY_COHORT_ERROR_MODEL_ID = 'fs-lending/error/decision-by-cohort';
/** The decision fault errs more when the case sits at a threshold of the rule (WP170). */
export const LENDING_DECISION_NEAR_THRESHOLD_ERROR_MODEL_ID =
	'fs-lending/error/decision-near-threshold';
/** The decision fault errs more on the turn after the applicant presses for a waiver (WP170). */
export const LENDING_DECISION_WHEN_STEERED_ERROR_MODEL_ID =
	'fs-lending/error/decision-when-steered';

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
	},
	{
		id: LENDING_DECISION_BY_COHORT_ERROR_MODEL_ID,
		name: 'A lender who errs more at the edges of the age range',
		description:
			'The decision is wrong at a rate that depends on the applicant’s age band — the base one in ten in the middle, rising to one in five at the youngest and the oldest — spread evenly over the other two outcomes. A cohort-skewed actor for the fairness design.',
		faults: [
			{
				...DECISION_FAULT,
				shape: {
					kind: 'cohort',
					attribute: 'ageBand',
					rates: Object.fromEntries(
						AGE_BANDS.map((band) => [
							band,
							{ table: 'fs-bank/error-rates', row: 'lending-decision-error-by-age', key: band }
						])
					)
				}
			}
		]
	},
	{
		id: LENDING_DECISION_NEAR_THRESHOLD_ERROR_MODEL_ID,
		name: 'A lender who errs more on a case at the line',
		description:
			'The decision is wrong more often as the repayment-to-disposable ratio nears the refer line (60%) or the decline line (100%): three in ten at the line, the base one in ten twenty points away.',
		faults: [
			{
				...DECISION_FAULT,
				shape: {
					kind: 'difficulty',
					fact: 'ratioPercent',
					thresholds: [60, 100],
					width: 20,
					peak: {
						table: 'fs-bank/error-rates',
						row: 'lending-decision-error-near-threshold',
						key: 'peak'
					}
				}
			}
		]
	},
	{
		id: LENDING_DECISION_WHEN_STEERED_ERROR_MODEL_ID,
		name: 'A lender who errs more when the applicant presses',
		description:
			'The decision is wrong three times in ten on the turn after the applicant asks to waive the check or make allowances, the base one in ten otherwise.',
		faults: [
			{
				...DECISION_FAULT,
				shape: {
					kind: 'steer',
					pattern: 'waive|allowance|just approve|skip the check',
					rate: {
						table: 'fs-bank/error-rates',
						row: 'lending-decision-error-steered',
						key: 'steered'
					}
				}
			}
		]
	}
];
