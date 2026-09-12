import { bookSchema, calibrationRow } from '@craftabot/core';
import { CALIBRATION, population } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { lendingBook } from './book.js';
import { DEFAULT_LENDING_POLICY } from './world/rules.js';

/**
 * **The loan book under the desk's rule** (WP75, `67-…` §3–§4; `65-…`
 * WP75's DoD): the performance label's base rate inside the cited range;
 * the outcome mix within its target's tolerance; a book byte-stable per
 * population and filter; the schema validating the book; a knob moving
 * the book's verdicts.
 */
const pop = population(1, { size: 20_000 });
const book = lendingBook(pop);

describe('the lending book', { timeout: 120_000 }, () => {
	it('is drawn at the application-incidence rate, in date order, every row judged and labelled', () => {
		const incidence = calibrationRow(CALIBRATION, 'application-incidence');
		const rate = book.rows.length / pop.customers.length;
		expect(Math.abs(rate - incidence.distribution['applies']!)).toBeLessThanOrEqual(
			incidence.tolerance
		);
		expect(book.rows.length).toBeGreaterThan(1_000);
		for (let i = 1; i < book.rows.length; i += 1) {
			expect(book.rows[i]!.date >= book.rows[i - 1]!.date).toBe(true);
		}
		expect(book.rows.every((row) => row.performance.basis === 'synthetic-hazard-v1')).toBe(true);
		expect(book.rows.every((row) => row.verdict.reasons.length > 0)).toBe(true);
	});

	it('the performance label’s base rate over approved loans sits inside the cited range, 2%–6% (67-… §3; the arrears-base-rate row)', () => {
		const range = calibrationRow(CALIBRATION, 'arrears-base-rate');
		const rate = (rows: typeof book.rows) =>
			rows.filter((row) => row.performance.defaultedWithin12m).length / Math.max(1, rows.length);
		const approved = book.rows.filter((row) => row.verdict.verdict === 'approve');
		const base = rate(approved);
		console.log(
			`performance base rate: approved ${(base * 100).toFixed(2)}%, referred ${(rate(book.rows.filter((row) => row.verdict.verdict === 'refer')) * 100).toFixed(2)}%, declined ${(rate(book.rows.filter((row) => row.verdict.verdict === 'decline')) * 100).toFixed(2)}%, all ${(rate(book.rows) * 100).toFixed(2)}% over ${book.rows.length} applications`
		);
		const target = range.distribution['default']!;
		expect(Math.abs(base - target)).toBeLessThanOrEqual(range.tolerance);
		// The rule's judgement and the outcome agree in direction: declines default more often than approvals (tenet 23, kept apart).
		expect(rate(book.rows.filter((row) => row.verdict.verdict === 'decline'))).toBeGreaterThan(
			base
		);
		// Declines carry the label too: the counterfactual exists in truth.
		const declined = book.rows.filter((row) => row.verdict.verdict === 'decline');
		expect(declined.some((row) => row.performance.defaultedWithin12m)).toBe(true);
		expect(declined.some((row) => !row.performance.defaultedWithin12m)).toBe(true);
	});

	it('the outcome mix sits within the loan-outcome-mix target’s tolerance', () => {
		const target = calibrationRow(CALIBRATION, 'loan-outcome-mix');
		const total = book.rows.length;
		for (const [outcome, share] of Object.entries(target.distribution)) {
			const observed = book.byOutcome[outcome as keyof typeof book.byOutcome] / total;
			console.log(`loan book ${outcome}: ${(observed * 100).toFixed(1)}% (target ${share * 100}%)`);
			expect(
				Math.abs(observed - share),
				`${outcome}: observed ${observed.toFixed(3)}, target ${share}`
			).toBeLessThanOrEqual(target.tolerance);
		}
	});

	it('is byte-stable per population and filter, and its work items validate against the book schema', () => {
		const again = lendingBook(population(1, { size: 20_000 }));
		expect(JSON.stringify(again)).toBe(JSON.stringify(book));
		expect(book.source).toMatchObject({ populationDigest: pop.digest, seed: 1, size: 20_000 });
		expect(() => bookSchema.parse(book.book)).not.toThrow();
		expect(book.book.items).toHaveLength(book.rows.length);
		expect(book.book.items[0]?.truth.facts?.['verdict']).toMatch(/^should-/);
		const filtered = lendingBook(pop, { filter: { outcome: 'decline', amount: [1000, 5000] } });
		expect(filtered.rows.every((row) => row.verdict.verdict === 'decline')).toBe(true);
		expect(filtered.rows.every((row) => row.application.amount <= 5000)).toBe(true);
		expect(filtered.source.filter).toEqual({ outcome: 'decline', amount: [1000, 5000] });
	});

	it('a stricter refer ratio moves the verdicts and nothing else', () => {
		const strict = lendingBook(pop, {
			policy: { ...DEFAULT_LENDING_POLICY, referRatioPercent: 30 }
		});
		expect(strict.rows.length).toBe(book.rows.length);
		expect(strict.byOutcome.refer).toBeGreaterThan(book.byOutcome.refer);
		expect(strict.rows.map((row) => row.application)).toEqual(
			book.rows.map((row) => row.application)
		);
	});

	it('the label never reaches a desk-facing record: nothing an applicant’s case carries names it', () => {
		const words = ['defaultedWithin12m', 'hazard', 'synthetic-hazard'];
		for (const row of book.rows.slice(0, 200)) {
			const facing = JSON.stringify({ application: row.application, customerId: row.customerId });
			for (const word of words) expect(facing).not.toContain(word);
		}
		// It is in the item's truth, and only there.
		const item = book.book.items[0]!;
		expect(JSON.stringify(item.payload)).not.toContain('hazard');
		expect(JSON.stringify(item.truth)).toContain('synthetic-hazard-v1');
	});
});
