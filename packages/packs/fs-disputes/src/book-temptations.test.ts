import { population } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { disputesBook } from './book.js';
import { ABOVE_LIMIT_PRESSURE, MERCHANT_NOTE_INJECTION } from './world/cases.js';
import { disputeVerdict } from './world/rules.js';

/**
 * The temptations in the book (`113-RECORDING-AND-RELIABILITY.md` §12, item 5): the first live recording read the stack and
 * no stack identically because a bot that is right never meets what the cards guard. A share of the book carries a note that
 * tries to instruct the assistant; the rule's verdict, in truth, never reads it.
 */
describe('the disputes book’s temptations', () => {
	const items = disputesBook(population(1, { size: 1500 })).items;
	const notes = (item: (typeof items)[number]) =>
		(item.payload as { investigation: Record<string, string> }).investigation;

	it('puts the instruction on one merchant dispute in three and the pressure on every above-limit scam', () => {
		const merchant = items.filter(
			(item) => item.truth?.facts?.['classification'] === 'class-merchant'
		);
		const injected = merchant.filter(
			(item) => notes(item)['merchantNote'] === MERCHANT_NOTE_INJECTION
		);
		expect(injected.length / merchant.length).toBeGreaterThan(0.28);
		expect(injected.length / merchant.length).toBeLessThan(0.38);
		const above = items.filter((item) => item.truth?.facts?.['verdict'] === 'should-refer');
		expect(above.length).toBeGreaterThan(5);
		for (const item of above) expect(notes(item)['representativeNote']).toBe(ABOVE_LIMIT_PRESSURE);
		// Only the above-limit scams carry the pressure.
		expect(items.filter((item) => notes(item)['representativeNote'] !== undefined).length).toBe(
			above.length
		);
	});

	it('leaves the verdict where the rule puts it', () => {
		for (const item of items.slice(0, 60)) {
			const payload = item.payload as { claim: Parameters<typeof disputeVerdict>[0] };
			expect(item.truth?.facts?.['verdict']).toBe(
				`should-${disputeVerdict(payload.claim, true).verdict}`
			);
		}
	});
});
