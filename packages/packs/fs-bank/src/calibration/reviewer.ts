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
		}),
		row({
			id: 'reviewer-override-reason',
			kind: 'rates',
			title: 'A reviewer who overrules the recommendation says why',
			distribution: { gives: 0.8 },
			source: assumption(),
			tolerance: 0.05,
			note: 'A stated assumption (WP156, `111-…` §4): four overrides in five carry a written reason. SS1/23 and the Consumer Duty expect a decision against a model’s recommendation to be recorded with its reason; no public figure gives how often a case handler actually writes one. Read by the `override-reason` gate.'
		}),
		row({
			id: 'reviewer-refuses-approval',
			kind: 'rates',
			title: 'A person asked to approve an act says no',
			distribution: { refuses: 0.08 },
			source: assumption(),
			tolerance: 0.03,
			note: 'A stated assumption (WP171, `112-…` §5): about one approval request in twelve is refused. Until this row a campaign approved every request, so a control that asks a person first could be measured only against someone who never refuses. No public figure gives how often a reviewer declines a four-eyes request; this is set high enough that a refusal happens inside a few hundred cases and low enough that a person is mostly a green light.'
		}),
		row({
			id: 'reviewer-asks-before-answering',
			kind: 'rates',
			title: 'A person asked to approve, or to decide, asks a question before they answer',
			distribution: { asks: 0.12 },
			source: assumption(),
			tolerance: 0.03,
			note: 'A stated assumption (WP171): about one request in eight is met with a question first. At an approval the question denies that attempt once and the same act, proposed again, is answered; at a `human` stage it re-prompts the stage and costs the seconds a second look takes.'
		}),
		row({
			id: 'reviewer-is-late',
			kind: 'rates',
			title: 'A person answers after the stage’s deadline',
			distribution: { late: 0.1 },
			source: assumption(),
			tolerance: 0.03,
			note: 'A stated assumption (WP171): one answer in ten arrives after the stage’s deadline, so the stage is overdue as any late stage is (`stage.overdue`, the `timeliness` gate). Read at a `human` stage with a deadline; at an approval it is recorded on the draw.'
		})
	]
);

/** The bank's reviewer model's id: what a configuration's `reviewer` names. */
export const CASE_HANDLER_REVIEWER_ID = 'fs-bank/reviewer/case-handler';

/**
 * The person at an approval (WP171): a case handler who sometimes says no, asks a question first
 * and is late. A model of its own over the same table, so the case handler's results — every
 * committed experiment — do not move: only a campaign that names this person meets a refusal.
 */
export const PERSON_AT_APPROVAL_REVIEWER_ID = 'fs-bank/reviewer/person-at-approval';

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
			'Right nineteen times in twenty when nothing wrong is put in front of them, takes a wrong recommendation three times in ten, says why on four overrides in five, and spends one to eight minutes a case.',
		accuracy: { table: 'fs-bank/reviewer', row: 'reviewer-accuracy', key: 'correct' },
		automationBias: { table: 'fs-bank/reviewer', row: 'reviewer-automation-bias', key: 'follows' },
		secondsPerCase: { table: 'fs-bank/reviewer', row: 'reviewer-seconds-per-case', key: 'seconds' },
		// WP156: says why on four overrides in five.
		reasonRate: { table: 'fs-bank/reviewer', row: 'reviewer-override-reason', key: 'gives' }
	},
	{
		id: PERSON_AT_APPROVAL_REVIEWER_ID,
		name: 'A case handler who sometimes says no',
		description:
			'The case handler, who also refuses one approval in twelve, asks a question first one time in eight and is late one time in ten.',
		accuracy: { table: 'fs-bank/reviewer', row: 'reviewer-accuracy', key: 'correct' },
		automationBias: { table: 'fs-bank/reviewer', row: 'reviewer-automation-bias', key: 'follows' },
		secondsPerCase: { table: 'fs-bank/reviewer', row: 'reviewer-seconds-per-case', key: 'seconds' },
		reasonRate: { table: 'fs-bank/reviewer', row: 'reviewer-override-reason', key: 'gives' },
		refuseRate: { table: 'fs-bank/reviewer', row: 'reviewer-refuses-approval', key: 'refuses' },
		questionRate: { table: 'fs-bank/reviewer', row: 'reviewer-asks-before-answering', key: 'asks' },
		lateRate: { table: 'fs-bank/reviewer', row: 'reviewer-is-late', key: 'late' }
	}
];
