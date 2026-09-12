import { bookSchema } from '@craftabot/core';
import { checkSynthetic } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { bankCase } from '../generate/case.js';
import { DECK_WEIGHTS } from '../calibration/deck-weights.js';
import { customerCase, population } from '../population/population.js';
import { bankRecords } from '../records.js';
import { alertRule, signalsOf } from './alert-rule.js';
import { FRAUD_OVERSAMPLE, alertBook } from './books.js';
import { HAZARD_V1, hazardOf, performanceLabel } from './performance.js';

/**
 * **The hazard, the alert rule and the alert book** (WP75, `67-…` §3, §5;
 * `65-…` WP75's DoD): the hazard's hand values; the rule's precision and
 * recall over a 20,000-customer population's last thirty days as a
 * calibration test; the planted label beside the transactions and never
 * on them; the alert book byte-stable and valid against the schema;
 * `bankCase` untouched by the planting.
 */
const clean = {
	customerId: 'c',
	scoreBand: 'excellent' as const,
	defaults: 0,
	arrearsMonths: 0,
	searchesLast12m: 0,
	affordability: { monthlyIncome: 3000, monthlyCommitments: 300, disposable: 1350 }
};

describe('the performance label', () => {
	it('the hazard gives the note’s hand values', () => {
		expect(hazardOf({ ratioPercent: 30 }, clean)).toBeCloseTo(0.0266, 3);
		expect(hazardOf({ ratioPercent: 60 }, clean)).toBeCloseTo(0.0502, 3);
		expect(
			hazardOf({ ratioPercent: 60 }, { ...clean, scoreBand: 'fair', defaults: 1 })
		).toBeCloseTo(0.162, 2);
		expect(
			hazardOf({ ratioPercent: 100 }, { ...clean, scoreBand: 'poor', defaults: 2 })
		).toBeCloseTo(0.655, 2);
		// Monotone in the ratio, capped.
		expect(hazardOf({ ratioPercent: 200 }, clean)).toBe(
			hazardOf({ ratioPercent: HAZARD_V1.ratioCap }, clean)
		);
		expect(hazardOf({ ratioPercent: 80 }, clean)).toBeGreaterThan(
			hazardOf({ ratioPercent: 50 }, clean)
		);
	});

	it('is one draw from the hazard, and says what it is', () => {
		const always = performanceLabel(() => 0.0, { ratioPercent: 30 }, clean);
		const never = performanceLabel(() => 0.999, { ratioPercent: 30 }, clean);
		expect(always).toEqual({
			defaultedWithin12m: true,
			hazard: 0.0266,
			basis: 'synthetic-hazard-v1'
		});
		expect(never.defaultedWithin12m).toBe(false);
	});
});

describe('the alert rule', () => {
	it('names each signal it trips, and none on an ordinary payment', () => {
		const pop = population(3, { size: 20 });
		const entry = pop.customers[0]!;
		const account = entry.accounts[0]!;
		const base = {
			id: 'txn-1',
			accountId: account.id,
			day: 0,
			time: '12:00',
			amount: account.baseline.typicalTransaction,
			direction: 'debit' as const,
			merchant: 'A shop',
			merchantCategory: 'groceries',
			channel: 'card-present' as const,
			country: 'United Kingdom',
			velocity: 1
		};
		expect(signalsOf(base, account)).toEqual([]);
		expect(signalsOf({ ...base, velocity: 3 }, account)).toEqual(['velocity']);
		expect(
			signalsOf({ ...base, device: 'app on a new phone', channel: 'card-not-present' }, account)
		).toEqual(['new-device']);
		expect(signalsOf({ ...base, country: 'Elsewhere' }, account)).toEqual(['abroad']);
		expect(
			signalsOf(
				{ ...base, channel: 'card-not-present', time: '02:10', amount: base.amount * 4 },
				account
			)
		).toEqual(['night-cnp']);
		expect(
			signalsOf({ ...base, channel: 'faster-payment', payee: 'a new payee' }, account)
		).toEqual(['new-payee']);
		expect(signalsOf({ ...base, amount: base.amount * 11 }, account)).toEqual(['large']);
		expect(alertRule(account, [base, { ...base, id: 'txn-2', velocity: 3 }])).toHaveLength(1);
	});
});

describe('the alert book', { timeout: 300_000 }, () => {
	const pop = population(1, { size: 20_000 });

	it('the rule’s precision and recall over the population’s last thirty days — the calibration test', () => {
		const started = performance.now();
		const result = alertBook(pop);
		console.log(
			`alert book: ${result.alerts} alerts, ${result.planted} planted, ${result.truePositives} caught — precision ${result.precision.toFixed(3)}, recall ${result.recall.toFixed(3)}, in ${Math.round(performance.now() - started)} ms`
		);
		expect(result.planted).toBeGreaterThan(100);
		expect(result.recall).toBeGreaterThanOrEqual(0.5);
		expect(result.precision).toBeGreaterThanOrEqual(0.05);
		expect(result.book.source).toMatchObject({
			populationDigest: pop.digest,
			oversample: FRAUD_OVERSAMPLE
		});
		expect(result.book.items.every((item) => item.kind === 'alert')).toBe(true);
		expect(() => bookSchema.parse(result.book)).not.toThrow();
		// Byte-stable: the same population, the same window, the same book.
		const again = alertBook(population(1, { size: 20_000 }), {});
		expect(JSON.stringify(again.book)).toBe(JSON.stringify(result.book));
		// A smaller scan is a prefix of the customers, and dated.
		const few = alertBook(pop, { customers: 500 });
		expect(few.book.items.length).toBeLessThan(result.book.items.length);
		expect(few.book.source.filter).toMatchObject({ customers: 500 });
	});

	it('the planted label is beside the transactions, never on them, and never in a desk-facing record', () => {
		const small = population(1, { size: 300 });
		let plantedSeen = 0;
		for (const entry of small.customers) {
			for (const account of entry.accounts) {
				for (let day = 150; day < 180; day += 1) {
					for (const transaction of small.transactions.forAccount(account.id, day)) {
						expect(JSON.stringify(transaction)).not.toMatch(/planted|fraudulent|mule-in/);
						if (small.transactions.plantedLabel(transaction.id)) plantedSeen += 1;
					}
				}
			}
		}
		expect(plantedSeen).toBeGreaterThan(0);
		const asCase = customerCase(small, small.customers[0]!.customer.id);
		const records = bankRecords(asCase);
		expect(JSON.stringify(records.revealed)).not.toMatch(/planted|fraudulent|mule-in/);
		expect(JSON.stringify(records.hidden)).not.toMatch(/planted|fraudulent|mule-in/);
		expect(
			checkSynthetic([{ path: 'alerts.json', text: JSON.stringify(alertBook(small).book) }])
		).toEqual([]);
	});

	it('bankCase draws from the deck weights, which plant nothing, and is what it was', () => {
		expect(DECK_WEIGHTS.rows.some((row) => row.id === 'fraud-incidence')).toBe(false);
		// The legacy-digest test in calibration.test.ts holds seeds 1…200 byte-identical; here the shape.
		expect(JSON.stringify(bankCase(7))).not.toMatch(/planted/);
	});
});
