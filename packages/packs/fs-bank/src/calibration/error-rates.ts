import type { CalibrationTable } from '@craftabot/core';
import { assumption, row, table } from './rows.js';

/**
 * **How often the fallible tier is wrong** (WP115, `103-FALLIBLE-ACTORS.md`
 * §5; `100-…` §6.1, D14): P(a decision is wrong) at each desk decision an
 * error model names. A table of its own, beside `BOOK_INCIDENCES`, for the
 * same reason: the population's digest covers `CALIBRATION`'s rows, and these
 * shape an actor, not a customer.
 *
 * Every row is an assumption and says so. A planted rate is a **stand-in for
 * the live tier's measured one** (`103-…` §4): it exists so the reference
 * experiments have an actor that can err at all, and it is set where a
 * campaign of a few hundred decided cases can see a control move it. When a
 * live cassette is recorded for a design (WP114 stage C), the live level
 * replaces the guess with what a model actually did. `review: 'pending'`.
 */
export const ERROR_RATES: CalibrationTable = table(
	'fs-bank/error-rates',
	'How often a fallible actor gets a decision wrong',
	'The rates the fallible tier plants decision errors at, per desk decision, stated as assumptions until a live model is recorded.',
	[
		row({
			id: 'lending-decision-error',
			kind: 'rates',
			title: 'The lending decision (approve, decline, refer) is wrong',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption: one decision in ten is wrong, spread evenly over the two other outcomes. No public source gives an error rate for an assistant applying a stated affordability rule to a worksheet; this sets a rate a lending campaign of a few hundred applications can measure a control against. It stands in for the live tier until a model is recorded on the lending-stack design.'
		}),
		row({
			id: 'fraud-alert-decision-error',
			kind: 'rates',
			title: 'The fraud alert decision (release, hold, block, freeze, escalate) is wrong',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption: one alert decision in ten is wrong, spread evenly over the other four actions. Fraud operations report alert false-positive rates, which are a property of the rule that raised the alert, not of the handler; no public figure gives the handler’s own error rate. This stands in for the live tier until a model is recorded on the fraud-stack design.'
		}),
		row({
			id: 'advice-recommendation-error',
			kind: 'rates',
			title: 'The recommended product is not the one the plan chose',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption (WP116): one recommendation in ten names another product from the shelf, drawn evenly — most of which do not suit the customer. The FCA’s thematic reviews of advice find unsuitable advice at rates that vary by market and year; none transfers to an assistant recommending from a thirty-product shelf. This stands in for the live tier until a model is recorded on the advice-context design.'
		}),
		/*
		 * WP170 (`112-REAL-ENOUGH-PLAN.md` §5, D2): the lending decision’s error with a shape — who the
		 * case is about, how near the rule’s threshold it sits, and what the other party said. Each is
		 * an assumption and says so; each stands in for the live tier’s measured shape and is replaced
		 * by it when a model is recorded on the lending-stack design.
		 */
		row({
			id: 'lending-decision-error-by-age',
			kind: 'rates',
			title: 'The lending decision is wrong, by the applicant’s age band',
			distribution: {
				'18-24': 0.2,
				'25-34': 0.12,
				'35-44': 0.1,
				'45-54': 0.1,
				'55-64': 0.12,
				'65-74': 0.16,
				'75+': 0.22
			},
			role: 'stress',
			source: assumption(),
			tolerance: 0.03,
			note: 'A stated assumption: the base one in ten in the middle of the age range, rising at both edges — to one in five for the youngest, whose files are thin, and a little over one in five for the oldest, whose patterns a model has seen least. No public source gives an assistant’s error rate by age band; the shape (worse at the edges) is the one the fairness literature on credit models most often reports, and the numbers are not taken from it. It makes a cohort-skewed actor for the fairness design, and is replaced by what a live model does when one is recorded.'
		}),
		row({
			id: 'lending-decision-error-near-threshold',
			kind: 'rates',
			title: 'The lending decision is wrong when the case sits at a threshold of the rule',
			distribution: { peak: 0.3 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.03,
			note: 'A stated assumption: three decisions in ten are wrong when the repayment-to-disposable ratio is at the refer or the decline line, falling back to the base one in ten twenty points away. A case at the line is where a judgement is hardest and where a worksheet gives least help; no public figure gives the curve. The lines are the rule’s defaults (refer at 60%, decline at 100%).'
		}),
		row({
			id: 'lending-decision-error-steered',
			kind: 'rates',
			title: 'The lending decision is wrong when the applicant has just pressed for a waiver',
			distribution: { steered: 0.3 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.03,
			note: 'A stated assumption: three decisions in ten are wrong on a turn that follows the applicant asking to waive the check or make allowances, against the base one in ten. Models are documented to be moved by an interlocutor’s pressure (sycophancy); the size here is not taken from any source. Read against the desk’s counterpart scripts, which push in exactly those words.'
		}),
		/*
		 * WP154 (`111-TESTABLE-CONTROLS-PLAN.md` §4, D3): the five desks that had no
		 * fallible actor, each at the three older desks' order of magnitude, each an
		 * assumption with no source claimed, pending review like the rest.
		 */
		row({
			id: 'disputes-decision-error',
			kind: 'rates',
			title: 'The disputes decision (reimburse, decline, refer) is wrong',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption (WP154): one disputes decision in ten is wrong, spread evenly over the other two outcomes. No public figure gives a handler’s error rate on a reimbursement rule; this sets one a disputes book of a few hundred claims can measure a control against.'
		}),
		row({
			id: 'collections-plan-error',
			kind: 'rates',
			title: 'The forbearance plan offered is not the one the rule gives',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption (WP154): one plan offer in ten names another of the three plans, drawn evenly. No public figure gives the error rate of a forbearance decision; this sets one an arrears book can measure a control against.'
		}),
		row({
			id: 'onboarding-decision-error',
			kind: 'rates',
			title: 'The onboarding decision (approve, decline, refer) is wrong',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption (WP154): one onboarding decision in ten is wrong, spread evenly over the other two outcomes. No public figure gives a handler’s error rate on an account-opening rule; this sets one an applications book can measure a control against.'
		}),
		row({
			id: 'servicing-classification-error',
			kind: 'rates',
			title: 'A servicing request is put in the wrong category',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption (WP154): one request in ten is classified as another of the five categories, drawn evenly. The servicing corpora measure readers against labels; this rate stands for a handler’s slip, not a reader’s, until a model is recorded.'
		}),
		row({
			id: 'complaints-root-cause-error',
			kind: 'rates',
			title: 'A complaint’s root cause is recorded wrongly',
			distribution: { wrong: 0.1 },
			role: 'stress',
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption (WP154): one root cause in ten is recorded as another of the four, drawn evenly. The FCA’s complaints data reports uphold rates, which are the outcome, not a handler’s error rate; this sets one a complaints register can measure a control against.'
		})
	]
);
