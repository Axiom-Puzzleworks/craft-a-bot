import type { CalibrationRow, CalibrationTable } from '@craftabot/core';
import { calibrationRow } from '@craftabot/core';
import { assumption, row, table } from './rows.js';

/**
 * **The Phase AA books' incidences** (WP112, `101-DAY7-ROADMAP.md`; `84-…` §8
 * item 16): how often a population customer turns up on the onboarding,
 * disputes, collections and servicing desks' books, and the shares the books
 * plant — until now literals in each pack's `book.ts`. Rows, so the rate is
 * read and reviewed like every other number the bank is shaped by (`101-…`
 * §5 rule 2), with the values exactly what the books used: every book,
 * campaign and bank day is byte-identical.
 *
 * A table of its own rather than rows in `CALIBRATION`: the population's
 * digest covers that table's rows, and these describe the desks' books, not
 * the population — adding them there would move every book's digest for no
 * change in a single customer.
 *
 * Every row is an assumption and says so. They are *teaching* incidences,
 * set so a book of a few thousand customers carries enough of each case to
 * measure; a real bank's rates are lower, and each note says which way.
 * Every row is `review: 'pending'` until someone reads it.
 */
export const BOOK_INCIDENCES: CalibrationTable = table(
	'fs-bank/book-incidences',
	'How often each desk’s book sees a customer',
	'The incidences the onboarding, disputes, collections and servicing books plant, stated as assumptions: the rates the books were built with, now rows.',
	[
		row({
			id: 'onboarding-incidence',
			kind: 'rates',
			title:
				'A customer applies to open an account in the period; of applicants, a screening hit and a details mismatch',
			distribution: { applies: 0.0833, hit: 0.2, mismatch: 0.125 },
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption for a teaching book, oversampled on purpose: one customer in twelve applies, and of applicants one in five matches a screening list entry and one in eight gives details that do not match the file. A real bank’s sanctions-screening true-hit rate is a small fraction of a percent; the book plants hits often enough that a campaign sees the tipping-off pair on every seed. The book reads each rate as “every 1/rate-th” (12, 5, 8).'
		}),
		row({
			id: 'disputes-incidence',
			kind: 'rates',
			title:
				'A customer disputes a payment in the window; of authorised-push-payment scams, one above the reimbursement limit',
			distribution: { disputes: 0.1, aboveLimit: 0.2 },
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption for a teaching book: one customer in ten disputes a payment in the window, the disputes cycling unauthorised / authorised scam / merchant in equal thirds, and one scam in five is above the limit. Real dispute and scam incidences are far lower and the scam share of disputes is not a third; the book is shaped so every classification and the limit appear on every seed. The book reads each rate as “every 1/rate-th” (10; one scam in 5, so every fifteenth dispute).'
		}),
		row({
			id: 'arrears-incidence',
			kind: 'rates',
			title: 'A borrower falls into arrears in the window',
			distribution: { arrears: 0.125 },
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption for a teaching book: one customer in eight is in arrears, cycling through four circumstances of which two disclose a need. The cited arrears base rate for the loan book (`arrears-base-rate`, 4%) is the population’s; this book is oversampled so the forbearance rule and the disclosure are exercised on every seed. The book reads the rate as “every 1/rate-th” (8).'
		}),
		row({
			id: 'servicing-request-incidence',
			kind: 'rates',
			title: 'A customer calls with a servicing request in the window',
			distribution: { requests: 0.1667 },
			source: assumption(),
			tolerance: 0.02,
			note: 'A stated assumption for a teaching book: one customer in six calls, the five requests (address, card, third-party access, a disclosure, a bereavement) in equal fifths. Real servicing contact is higher in volume and dominated by routine requests; the fifths are there so every category and both handoffs appear on every seed. The book reads the rate as “every 1/rate-th” (6).'
		})
	]
);

/** A book's “every n-th” from a rate row: the rounding the books use, so 0.0833 reads 12 and 0.1667 reads 6. */
export function everyNth(
	rowId: string,
	key: string,
	from: CalibrationTable = BOOK_INCIDENCES
): number {
	const found: CalibrationRow = calibrationRow(from, rowId);
	const rate = found.distribution[key];
	if (rate === undefined || !(rate > 0 && rate <= 1))
		throw new Error(`calibration row "${rowId}" has no rate "${key}" in (0, 1]`);
	return Math.round(1 / rate);
}
