import { createHash } from 'node:crypto';
import { checkCalibration } from '@craftabot/pack-testkit';
import type { CalibrationRow } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { bankCase } from '../generate/case.js';
import { customerCase, population } from '../population/population.js';
import { AGE_BANDS, INCOME_BANDS, type BankCase } from '../model.js';
import { CALIBRATION } from './table.js';
import { DECK_WEIGHTS } from './deck-weights.js';
import { BOOK_INCIDENCES, everyNth } from './book-incidences.js';
import { ERROR_RATES } from './error-rates.js';
import { ERROR_RATES_MEASURED } from './error-rates-measured.js';
import { BILL_RATES } from './bill.js';
import { COMPLICATIONS, drawComplications } from './complications.js';
import { CASE_HANDLER_REVIEWER_ID, REVIEWER_RATES, bankReviewerModels } from './reviewer.js';
import legacy from './legacy-digests.json' with { type: 'json' };

/**
 * **The calibration table's three promises** (WP74 stage A, `66-CALIBRATION.md`
 * §4.2 and §4.5):
 *
 * 1. **The seam did not move the decks.** `bankCase(seed)` draws from
 *    `DECK_WEIGHTS` and is byte-identical to what it drew before the rows
 *    existed — the SHA-256 of its JSON for seeds 1…200, frozen in
 *    `legacy-digests.json` from the build before this WP.
 * 2. **Both tables pass `checkCalibration`**, with the rows that name a
 *    model enum matched against it.
 * 3. **A population drawn from `CALIBRATION` has the marginals its rows
 *    claim**, within each row's tolerance — every row read off 20,000
 *    customers (2,000 with their transactions), and the rows no case can
 *    show named as such rather than quietly skipped.
 */
const enums = {
	'age-band': AGE_BANDS,
	'income-band': INCOME_BANDS,
	'complaint-category': [
		'service',
		'charges',
		'advice',
		'fraud-handling',
		'lending-decision',
		'data'
	]
};

describe('the calibration seam', () => {
	it('bankCase(seed) is byte-identical to the build before the rows existed, seeds 1…200', () => {
		const digests = legacy as Record<string, string>;
		for (let seed = 1; seed <= 200; seed += 1) {
			const digest = createHash('sha256')
				.update(JSON.stringify(bankCase(seed)))
				.digest('hex');
			expect(digest, `seed ${seed}`).toBe(digests[String(seed)]);
		}
	});

	it('both tables pass checkCalibration, and every cited row is awaiting review', () => {
		expect(checkCalibration(CALIBRATION, { enums })).toEqual([]);
		expect(checkCalibration(DECK_WEIGHTS, { enums })).toEqual([]);
		expect(CALIBRATION.rows.every((row) => row.review === 'pending')).toBe(true);
		expect(CALIBRATION.rows.some((row) => row.source.kind === 'publication')).toBe(true);
		expect(DECK_WEIGHTS.rows.every((row) => row.source.kind === 'assumption')).toBe(true);
		// Every row the deck weights carry is a row the cited table carries too, so a generator reads either;
		// the cited table has more — the books' rows (WP75), which a designed case never draws.
		const cited = new Set(CALIBRATION.rows.map((row) => row.id));
		for (const row of DECK_WEIGHTS.rows) expect(cited.has(row.id), row.id).toBe(true);
	});
});

const SIZE = 20_000;
const WITH_TRANSACTIONS = 2_000;
type Draw = (c: BankCase) => string | undefined;
type Flag = (c: BankCase) => boolean | undefined;

const over65 = (c: BankCase) =>
	c.customer.cohort.ageBand === '65-74' || c.customer.cohort.ageBand === '75+';
const strained = (c: BankCase) => {
	const { monthlyCommitments, monthlyIncome } = c.bureau.affordability;
	return (
		c.customer.vulnerability.resilience.includes('over-indebted') ||
		monthlyCommitments / Math.max(1, monthlyIncome) > 0.6
	);
};
const anyDriver = (c: BankCase, key: keyof BankCase['customer']['vulnerability']) =>
	c.customer.vulnerability[key].length > 0;

/** For a weights row: the category a case shows, or undefined when the row does not apply to it. */
const draws: Record<string, Draw> = {
	'age-band': (c) => c.customer.cohort.ageBand,
	'employment-65-plus': (c) => (over65(c) ? c.customer.employment : undefined),
	'employment-18-24': (c) =>
		c.customer.cohort.ageBand === '18-24' ? c.customer.employment : undefined,
	'employment-25-64': (c) =>
		over65(c) || c.customer.cohort.ageBand === '18-24' ? undefined : c.customer.employment,
	'income-not-earning': (c) =>
		['student', 'unemployed', 'carer'].includes(c.customer.employment)
			? c.customer.cohort.incomeBand
			: undefined,
	'income-retired': (c) =>
		c.customer.employment === 'retired' ? c.customer.cohort.incomeBand : undefined,
	'income-working': (c) =>
		['employed', 'self-employed'].includes(c.customer.employment)
			? c.customer.cohort.incomeBand
			: undefined,
	'literacy-band': (c) => c.customer.cohort.literacyBand,
	'digital-confidence-65-plus': (c) => (over65(c) ? c.customer.digitalConfidence : undefined),
	'digital-confidence-under-65': (c) => (over65(c) ? undefined : c.customer.digitalConfidence),
	dependants: (c) => String(c.customer.dependants),
	'preferred-channel': (c) => c.customer.consent.preferredChannel,
	'complaint-count': (c) => String(c.complaints.length),
	'bureau-strained-defaults': (c) => (strained(c) ? String(c.bureau.defaults) : undefined),
	// Target rows: the population's marginal, drawn through the conditional rows.
	'income-band': (c) => c.customer.cohort.incomeBand
};

/** For a rates row: per category, whether a case shows it, or undefined when the row does not apply. */
const flags: Record<string, Record<string, Flag>> = {
	'support-needs': {
		supportNeeds: (c) => (anyDriver(c, 'health') ? c.customer.cohort.supportNeeds : undefined)
	},
	'protected-proxy-rate': {
		proxy: (c) => c.customer.cohort.protectedProxies.includes('proxy-c')
	},
	consent: {
		marketing: (c) => c.customer.consent.marketing,
		dataSharing: (c) => c.customer.consent.dataSharing
	},
	'savings-holding': { savings: (c) => c.accounts.some((a) => a.kind === 'savings') },
	'product-holding': {
		'credit-card': (c) => c.accounts.some((a) => a.kind === 'credit-card'),
		loan: (c) => c.accounts.some((a) => a.kind === 'loan'),
		mortgage: (c) =>
			c.customer.employment === 'student'
				? undefined
				: c.accounts.some((a) => a.kind === 'mortgage')
	},
	'bureau-stray-default': {
		default: (c) => (strained(c) ? undefined : c.bureau.defaults === 1)
	},
	// Targets over the drivers: the share with any driver in the grouping.
	'vulnerability-driver-marginals': {
		health: (c) => anyDriver(c, 'health'),
		lifeEvents: (c) => anyDriver(c, 'lifeEvents'),
		resilience: (c) => anyDriver(c, 'resilience')
	},
	'vulnerability-capability-marginal': { capability: (c) => anyDriver(c, 'capability') },
	'vulnerability-any': {
		any: (c) =>
			anyDriver(c, 'health') ||
			anyDriver(c, 'lifeEvents') ||
			anyDriver(c, 'resilience') ||
			anyDriver(c, 'capability')
	}
};

/** Rows a case cannot show — the draw leaves no mark on the record — checked by construction, named here so nothing is skipped in silence. */
const BY_CONSTRUCTION = new Set([
	'vulnerability-drivers', // the per-draw rate; its marginals are the target rows
	'vulnerability-disclosure', // per driver, checked below over the drivers themselves
	'transaction-departure', // the departure flag is not on the transaction
	// The books' rows (WP75): read off the loan book and the alert book in book/books.test.ts and fs-lending's book test.
	'application-incidence',
	'loan-amount',
	'loan-term',
	'loan-purpose',
	'declared-income-noise',
	'loan-outcome-mix',
	'arrears-base-rate',
	'fraud-incidence',
	// The clock's rows (WP83): read off the arrivals and the advice-request register in clock.test.ts.
	'arrival-rates',
	'advice-request-incidence'
]);

/** Rows read off the transaction sample rather than the customer sample. */
const perTransaction: Record<string, (c: BankCase) => string[]> = {
	'channel-mix-card': (c) => {
		const cards = new Set(c.accounts.filter((a) => a.kind === 'credit-card').map((a) => a.id));
		return c.transactions
			.filter(
				(t) =>
					cards.has(t.accountId) &&
					(t.channel === 'card-present' || t.channel === 'card-not-present')
			)
			.map((t) => t.channel);
	},
	'channel-mix-current': (c) => {
		const cards = new Set(c.accounts.filter((a) => a.kind === 'credit-card').map((a) => a.id));
		return c.transactions
			.filter(
				(t) =>
					!cards.has(t.accountId) &&
					(t.channel === 'card-present' ||
						t.channel === 'card-not-present' ||
						t.channel === 'faster-payment')
			)
			.map((t) => t.channel);
	},
	'savings-rate-bps': (c) =>
		c.accounts.filter((a) => a.kind === 'savings').map((a) => String(a.interestRateBps)),
	'credit-limit': (c) =>
		c.accounts.filter((a) => a.kind === 'credit-card').map((a) => String(a.creditLimit)),
	'complaint-category': (c) => c.complaints.map((x) => x.category),
	'complaint-status': (c) => c.complaints.map((x) => x.status)
};
const perTransactionFlags: Record<string, Record<string, (c: BankCase) => boolean[]>> = {
	'transaction-credit-share': { credit: (c) => c.transactions.map((t) => t.direction === 'credit') }
};
const share = (counts: Map<string, number>, key: string, total: number) =>
	total === 0 ? 0 : (counts.get(key) ?? 0) / total;

describe('a population drawn from CALIBRATION', { timeout: 300_000 }, () => {
	// The population itself (stage B): twenty thousand customers, the first two thousand with their last thirty days.
	const pop = population(1, { size: SIZE });
	const cases: BankCase[] = pop.customers.map((entry, index) =>
		index < WITH_TRANSACTIONS
			? customerCase(pop, entry.customer.id)
			: {
					seed: entry.seed,
					customer: entry.customer,
					accounts: entry.accounts,
					transactions: [],
					complaints: entry.complaints,
					bureau: entry.bureau,
					shelf: []
				}
	);
	const withTransactions = cases.slice(0, WITH_TRANSACTIONS);

	const rowsChecked = new Set<string>();

	function expectWeights(row: CalibrationRow, observed: string[]): void {
		const counts = new Map<string, number>();
		for (const value of observed) counts.set(value, (counts.get(value) ?? 0) + 1);
		const total = Object.values(row.distribution).reduce((sum, w) => sum + w, 0);
		for (const [category, weight] of Object.entries(row.distribution)) {
			const expected = weight / total;
			const actual = share(counts, category, observed.length);
			expect(
				Math.abs(actual - expected),
				`${row.id}/${category}: expected ${expected.toFixed(3)}, observed ${actual.toFixed(3)} over ${observed.length}`
			).toBeLessThanOrEqual(row.tolerance);
		}
		// Nothing outside the row's categories was drawn.
		for (const category of counts.keys())
			expect(row.distribution, `${row.id} drew ${category}`).toHaveProperty(category);
		rowsChecked.add(row.id);
	}

	function expectRates(row: CalibrationRow, observed: Record<string, boolean[]>): void {
		for (const [category, expected] of Object.entries(row.distribution)) {
			const values = observed[category] ?? [];
			const actual = values.filter(Boolean).length / Math.max(1, values.length);
			expect(
				Math.abs(actual - expected),
				`${row.id}/${category}: expected ${expected.toFixed(3)}, observed ${actual.toFixed(3)} over ${values.length}`
			).toBeLessThanOrEqual(row.tolerance);
		}
		rowsChecked.add(row.id);
	}

	for (const row of CALIBRATION.rows) {
		if (BY_CONSTRUCTION.has(row.id)) continue;
		it(`${row.id} — ${row.title}`, () => {
			if (draws[row.id]) {
				const observed = cases.map(draws[row.id]!).filter((v): v is string => v !== undefined);
				expectWeights(row, observed);
			} else if (perTransaction[row.id]) {
				expectWeights(row, withTransactions.flatMap(perTransaction[row.id]!));
			} else if (flags[row.id]) {
				const observed: Record<string, boolean[]> = {};
				for (const [category, flag] of Object.entries(flags[row.id]!)) {
					observed[category] = cases.map(flag).filter((v): v is boolean => v !== undefined);
				}
				expectRates(row, observed);
			} else if (perTransactionFlags[row.id]) {
				const observed: Record<string, boolean[]> = {};
				for (const [category, flag] of Object.entries(perTransactionFlags[row.id]!)) {
					observed[category] = withTransactions.flatMap(flag);
				}
				expectRates(row, observed);
			} else {
				throw new Error(
					`row ${row.id} has no extractor and is not listed as checked by construction`
				);
			}
		});
	}

	it('every driver a customer has is disclosed at the disclosure rate', () => {
		const row = CALIBRATION.rows.find((r) => r.id === 'vulnerability-disclosure')!;
		let drivers = 0;
		let disclosed = 0;
		for (const c of cases) {
			for (const key of ['health', 'lifeEvents', 'resilience', 'capability'] as const) {
				drivers += c.customer.vulnerability[key].length;
				disclosed += c.customer.disclosed[key].length;
			}
		}
		expect(Math.abs(disclosed / drivers - row.distribution['disclosed']!)).toBeLessThanOrEqual(
			row.tolerance
		);
		rowsChecked.add(row.id);
	});

	it('every row was read, or is named as checked by construction', () => {
		const unread = CALIBRATION.rows
			.map((r) => r.id)
			.filter((id) => !rowsChecked.has(id) && !BY_CONSTRUCTION.has(id));
		expect(unread).toEqual([]);
	});
});

describe('the Phase AA books’ incidences (WP112)', () => {
	it('pass checkCalibration as assumptions, every row awaiting review', () => {
		expect(checkCalibration(BOOK_INCIDENCES)).toEqual([]);
		expect(BOOK_INCIDENCES.rows.every((row) => row.review === 'pending')).toBe(true);
		expect(BOOK_INCIDENCES.rows.every((row) => row.source.kind === 'assumption')).toBe(true);
	});

	it('read back as the “every n-th” the books were built with, so every book is byte-identical', () => {
		expect(everyNth('onboarding-incidence', 'applies')).toBe(12);
		expect(everyNth('onboarding-incidence', 'hit')).toBe(5);
		expect(everyNth('onboarding-incidence', 'mismatch')).toBe(8);
		expect(everyNth('disputes-incidence', 'disputes')).toBe(10);
		expect(everyNth('disputes-incidence', 'aboveLimit')).toBe(5);
		expect(everyNth('arrears-incidence', 'arrears')).toBe(8);
		expect(everyNth('servicing-request-incidence', 'requests')).toBe(6);
		expect(() => everyNth('arrears-incidence', 'nothing')).toThrow(/no rate/);
	});

	it('sit outside the population’s table, so no population digest moves', () => {
		const cited = new Set(CALIBRATION.rows.map((row) => row.id));
		for (const row of BOOK_INCIDENCES.rows) expect(cited.has(row.id), row.id).toBe(false);
	});
});

describe('the measured error rates (WP197)', () => {
	it('pass checkCalibration, name their recording and model, and sit beside the stress rows they do not replace', () => {
		expect(checkCalibration(ERROR_RATES_MEASURED)).toEqual([]);
		expect(ERROR_RATES_MEASURED.rows.length).toBeGreaterThan(0);
		const stress = new Set(ERROR_RATES.rows.filter((r) => r.role === 'stress').map((r) => r.id));
		for (const row of ERROR_RATES_MEASURED.rows) {
			expect(row.review).toBe('pending');
			expect(row.source.kind).toBe('measurement');
			if (row.source.kind !== 'measurement') continue;
			expect(row.source.interval[0]).toBeLessThanOrEqual(row.distribution.wrong!);
			expect(row.source.interval[1]).toBeGreaterThanOrEqual(row.distribution.wrong!);
			// The assumed row it sits beside still exists and is marked as the stress level.
			expect(stress.has(row.id.replace(/-measured-(giant|quick)$/, '')), row.id).toBe(true);
		}
	});

	it('every assumed error rate is the stress level, none of them read as a model’s rate', () => {
		expect(ERROR_RATES.rows.every((r) => r.role === 'stress')).toBe(true);
	});
});

describe('the fallible actors’ rows (WP115)', () => {
	it('pass checkCalibration as assumptions, every row awaiting review, apart from the population', () => {
		const cited = new Set(CALIBRATION.rows.map((row) => row.id));
		for (const table of [ERROR_RATES, REVIEWER_RATES, BILL_RATES, COMPLICATIONS]) {
			expect(checkCalibration(table)).toEqual([]);
			expect(table.rows.every((row) => row.review === 'pending')).toBe(true);
			expect(table.rows.every((row) => row.source.kind === 'assumption')).toBe(true);
			for (const row of table.rows) expect(cited.has(row.id), row.id).toBe(false);
		}
	});

	it('the case handler reads its three rows from the reviewer table', () => {
		const [model] = bankReviewerModels;
		expect(model?.id).toBe(CASE_HANDLER_REVIEWER_ID);
		for (const ref of [model!.accuracy, model!.automationBias, model!.secondsPerCase]) {
			expect(ref.table).toBe(REVIEWER_RATES.id);
			expect(REVIEWER_RATES.rows.some((row) => row.id === ref.row)).toBe(true);
		}
	});
});

describe('drawing complications (WP173)', () => {
	const draw = (seed: number) => drawComplications(mulberry(seed), 'servicing');
	function mulberry(seed: number): () => number {
		let a = seed;
		return () => {
			a += 0x6d2b79f5;
			let t = a;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	it('is deterministic, distinct, in the table’s order, and within the desk’s own kinds', () => {
		const order = Object.keys(
			COMPLICATIONS.rows.find((r) => r.id === 'servicing-which')!.distribution
		);
		for (let seed = 1; seed <= 200; seed += 1) {
			const set = draw(seed);
			expect(draw(seed)).toEqual(set);
			expect(new Set(set).size).toBe(set.length);
			expect(set.length).toBeGreaterThanOrEqual(1);
			expect(set).toEqual([...set].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
			for (const id of set) expect(order).toContain(id);
		}
	});

	it('refuses a desk with no rows', () => {
		expect(() => drawComplications(mulberry(1), 'nowhere')).toThrow(/no row/);
	});
});
