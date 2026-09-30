import type { CalibrationTable, ReviewerModel } from '@craftabot/core';
import { assumption, row, table } from './rows.js';

/**
 * **The person at a `human` stage, as rows** (WP115, `103-FALLIBLE-ACTORS.md`
 * §6; `100-…` §6.2, D15): accuracy, automation bias and seconds per case for
 * a bank case handler reviewing another's work. A table of its own, like
 * `ERROR_RATES`, so no population digest moves. Every row is an assumption and
 * says so, `review: 'pending'`: a reviewer fitted to observed reviewers is a
 * later day's work and someone else's data (`101-…` §7).
 */
export const REVIEWER_RATES: CalibrationTable = table(
	'fs-bank/reviewer',
	'The person at a review stage',
	'How often a case handler reviewing a decision is right, how often they take a wrong recommendation, and how long a case takes them — stated as assumptions.',
	[
		row({
			id: 'reviewer-accuracy',
			kind: 'rates',
			title: 'A reviewer answers a case right when nothing wrong is put in front of them',
			distribution: { correct: 0.95 },
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption: nineteen cases in twenty. No public source gives a retail bank reviewer’s accuracy at a four-eyes check; this is set high enough that a person is worth having and low enough that a person is not an oracle.'
		}),
		row({
			id: 'reviewer-automation-bias',
			kind: 'rates',
			title: 'A reviewer takes a wrong recommendation the case puts in front of them',
			distribution: { follows: 0.3 },
			source: assumption(),
			tolerance: 0.05,
			note: 'A stated assumption: three wrong recommendations in ten are waved through. Automation bias — a person accepting a system’s wrong advice they would otherwise have got right — is documented across decision-support settings (Goddard, Roudsari and Wyatt’s 2012 systematic review in JAMIA is the usual starting point), with frequencies that vary too much by task to transfer; 0.3 is not taken from it.'
		}),
		row({
			id: 'reviewer-seconds-per-case',
			kind: 'weights',
			title: 'How long a review takes, in seconds',
			distribution: { '60': 20, '120': 45, '240': 25, '480': 10 },
			source: assumption(),
			tolerance: 0.05,
			note: 'A stated assumption: most reviews take one to four minutes, a tenth take eight. The keys are seconds; the weights are relative. Folded as cost per case by human load v2.'
		})
	]
);

/** The bank's reviewer model's id: what a configuration's `reviewer` names. */
export const CASE_HANDLER_REVIEWER_ID = 'fs-bank/reviewer/case-handler';

/**
 * **A case handler reviewing another's work** (WP115): the one reviewer model
 * the bank ships, over `REVIEWER_RATES`. A configuration names it as
 * `reviewer`; every desk's human stages answer through it.
 */
export const bankReviewerModels: ReviewerModel[] = [
	{
		id: CASE_HANDLER_REVIEWER_ID,
		name: 'A case handler reviewing another’s work',
		description:
			'Right nineteen times in twenty when nothing wrong is put in front of them, takes a wrong recommendation three times in ten, and spends one to eight minutes a case.',
		accuracy: { table: 'fs-bank/reviewer', row: 'reviewer-accuracy', key: 'correct' },
		automationBias: { table: 'fs-bank/reviewer', row: 'reviewer-automation-bias', key: 'follows' },
		secondsPerCase: { table: 'fs-bank/reviewer', row: 'reviewer-seconds-per-case', key: 'seconds' }
	}
];
