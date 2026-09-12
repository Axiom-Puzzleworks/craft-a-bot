import { assumption, row, table } from './rows.js';

/**
 * **The design-time weights** (WP74, `66-CALIBRATION.md` §4.2 and §6): the
 * numbers the generators shipped with in WP59, moved out of the code into
 * rows so `bankCase(seed)` reads a table like the population does — and
 * kept exactly, because every desk deck, every golden trace and every
 * desk test was designed on the cases these weights produce. A deck is a
 * designed case, not a sample; `bankCase(seed)` draws from this table by
 * default and is byte-identical to what it drew before this WP
 * (`legacy-digests.json`). The population draws from `CALIBRATION`.
 *
 * Every row is a typed assumption with the same note, so the table passes
 * `checkCalibration` on its own terms and the bank page can say what it is.
 */
const NOTE =
	'The weight the generators shipped with in WP59 (48-FS-BANK.md §4.2), kept so every desk deck and golden trace holds; the population draws from the cited table instead.';

const deck = (
	id: string,
	kind: 'weights' | 'rates',
	title: string,
	distribution: Record<string, number>
) => row({ id, kind, title, distribution, source: assumption(), tolerance: 0.05, note: NOTE });

export const DECK_WEIGHTS = table(
	'fs-bank/deck-weights',
	'The design-time weights',
	'What bankCase(seed) draws from: the WP59 weights the decks were designed on, unchanged.',
	[
		deck('age-band', 'weights', 'Age band', {
			'18-24': 8,
			'25-34': 18,
			'35-44': 20,
			'45-54': 18,
			'55-64': 16,
			'65-74': 12,
			'75+': 8
		}),
		deck('employment-65-plus', 'weights', 'Employment status, 65 and over', {
			retired: 8,
			employed: 1,
			'self-employed': 1
		}),
		deck('employment-18-24', 'weights', 'Employment status, 18–24', {
			student: 4,
			employed: 5,
			unemployed: 1
		}),
		deck('employment-25-64', 'weights', 'Employment status, 25–64', {
			employed: 12,
			'self-employed': 3,
			carer: 1,
			unemployed: 1
		}),
		deck('income-not-earning', 'weights', 'Income band — students, carers, unemployed', {
			'under-15k': 6,
			'15-25k': 3,
			'25-40k': 1
		}),
		deck('income-retired', 'weights', 'Income band — retired', {
			'under-15k': 3,
			'15-25k': 5,
			'25-40k': 3,
			'40-60k': 1
		}),
		deck('income-working', 'weights', 'Income band — employed and self-employed', {
			'15-25k': 4,
			'25-40k': 8,
			'40-60k': 6,
			'60-100k': 3,
			'over-100k': 1
		}),
		deck('literacy-band', 'weights', 'Literacy band', { low: 2, medium: 5, high: 3 }),
		deck('digital-confidence-65-plus', 'weights', 'Digital confidence, 65 and over', {
			low: 4,
			medium: 4,
			high: 2
		}),
		deck('digital-confidence-under-65', 'weights', 'Digital confidence, under 65', {
			low: 1,
			medium: 4,
			high: 5
		}),
		deck(
			'vulnerability-drivers',
			'rates',
			'Vulnerability drivers — the per-draw rate per grouping',
			{
				health: 0.18,
				lifeEvents: 0.18,
				resilience: 0.18,
				capability: 0.18
			}
		),
		deck('vulnerability-disclosure', 'rates', 'A driver the customer has told the bank about', {
			disclosed: 0.5
		}),
		deck('support-needs', 'rates', 'Support needs, given a health driver', { supportNeeds: 0.6 }),
		deck('protected-proxy-rate', 'rates', 'Each protected-characteristic proxy', { proxy: 0.3 }),
		deck('dependants', 'weights', 'Dependants', { '0': 6, '1': 3, '2': 3, '3': 1 }),
		deck('consent', 'rates', 'Consents given', { marketing: 0.4, dataSharing: 0.3 }),
		deck('preferred-channel', 'weights', 'Preferred channel', {
			app: 5,
			phone: 3,
			branch: 1,
			post: 1
		}),
		deck('savings-holding', 'rates', 'Holds a savings account', { savings: 0.7 }),
		deck('product-holding', 'rates', 'Holds a credit card, a loan, a mortgage', {
			'credit-card': 0.5,
			loan: 0.25,
			mortgage: 0.3
		}),
		deck('savings-rate-bps', 'weights', 'Savings rate, basis points', {
			'150': 2,
			'300': 4,
			'425': 3
		}),
		deck('credit-limit', 'weights', 'Credit-card limit', {
			'1000': 3,
			'2500': 4,
			'5000': 2,
			'10000': 1
		}),
		deck('transaction-departure', 'rates', 'A transaction that departs from the baseline', {
			departure: 0.12
		}),
		deck('channel-mix-card', 'weights', 'Channel, on a credit card', {
			'card-present': 6,
			'card-not-present': 4
		}),
		deck('channel-mix-current', 'weights', 'Channel, on a current or savings account', {
			'card-present': 5,
			'card-not-present': 3,
			'faster-payment': 2
		}),
		deck('transaction-credit-share', 'rates', 'A transaction that is a credit', { credit: 0.08 }),
		deck('bureau-stray-default', 'rates', 'A default with no strain behind it', { default: 0.05 }),
		deck('bureau-strained-defaults', 'weights', 'Defaults, when over-indebted or strained', {
			'0': 2,
			'1': 3,
			'2': 1
		}),
		deck('complaint-count', 'weights', 'Complaints on file', { '0': 7, '1': 2, '2': 1 }),
		deck('complaint-category', 'weights', 'Complaint category', {
			service: 1,
			charges: 1,
			advice: 1,
			'fraud-handling': 1,
			'lending-decision': 1,
			data: 1
		}),
		deck('complaint-status', 'weights', 'Complaint status', {
			open: 5,
			acknowledged: 3,
			resolved: 2
		})
	]
);
