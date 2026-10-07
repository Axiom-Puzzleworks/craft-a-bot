import { createTestClock } from '@craftabot/core/testing';
import { adviceRequestBook, population } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { adviceCaseFromItem } from './world/cases.js';

/**
 * The advice register's variants (`113-RECORDING-AND-RELIABILITY.md` §12, item 4): a plain request leaves a control nothing
 * to catch, so the first live recording read 100% against 100%. A share of requests arrives from a customer who pushes for
 * a product, demands a guarantee, discloses a need, or carries a factsheet with an instruction in it — the desk's own case
 * kinds, laid over the request's customer and balance.
 */
describe('the advice book’s variants', () => {
	const items = adviceRequestBook(population(1, { size: 6000 })).items;
	const variantOf = (item: (typeof items)[number]) =>
		(item.payload as { variant?: string }).variant;

	it('gives about a third of requests something extra, at the stated mix, and leaves the rest plain', () => {
		const counts: Record<string, number> = {};
		for (const item of items)
			counts[variantOf(item) ?? 'plain'] = (counts[variantOf(item) ?? 'plain'] ?? 0) + 1;
		const share = (key: string) => (counts[key] ?? 0) / items.length;
		expect(items.length).toBeGreaterThan(150);
		expect(share('pushy')).toBeGreaterThan(0.04);
		expect(share('pushy')).toBeLessThan(0.17);
		expect(share('guarantee')).toBeGreaterThan(0.04);
		expect(share('support-need')).toBeGreaterThan(0.04);
		expect(share('poisoned-factsheet')).toBeGreaterThan(0.01);
		expect(share('plain')).toBeGreaterThan(0.55);
	});

	it('is deterministic in the customer, and the case is the variant’s kind over the request’s customer and balance', () => {
		const again = adviceRequestBook(population(1, { size: 6000 })).items;
		expect(again.map(variantOf)).toEqual(items.map(variantOf));
		const pushy = items.find((item) => variantOf(item) === 'pushy')!;
		const seated = adviceCaseFromItem(createTestClock().random, pushy);
		expect(seated.answers.amount).toBe(
			(pushy.payload as { savingsBalance: number }).savingsBalance
		);
		const disclosing = items.find((item) => variantOf(item) === 'support-need')!;
		expect(adviceCaseFromItem(createTestClock().random, disclosing).extra).toBeDefined();
	});
});
