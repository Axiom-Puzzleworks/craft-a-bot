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
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption: one decision in ten is wrong, spread evenly over the two other outcomes. No public source gives an error rate for an assistant applying a stated affordability rule to a worksheet; this sets a rate a lending campaign of a few hundred applications can measure a control against. It stands in for the live tier until a model is recorded on the lending-stack design.'
		}),
		row({
			id: 'fraud-alert-decision-error',
			kind: 'rates',
			title: 'The fraud alert decision (release, hold, block, freeze, escalate) is wrong',
			distribution: { wrong: 0.1 },
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption: one alert decision in ten is wrong, spread evenly over the other four actions. Fraud operations report alert false-positive rates, which are a property of the rule that raised the alert, not of the handler; no public figure gives the handler’s own error rate. This stands in for the live tier until a model is recorded on the fraud-stack design.'
		})
	]
);
