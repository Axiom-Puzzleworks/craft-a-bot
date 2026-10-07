import { createTestClock } from '@craftabot/core/testing';
import { population } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import { servicingBook } from './book.js';
import { servicingCaseFromItem } from './world/cases.js';

/**
 * A live customer opens with what they came for (`113-RECORDING-AND-RELIABILITY.md` §12, item 3): the request itself in
 * their words, not the opening of whichever anchor the population drew for them (an investor's "I was wondering what I
 * should do with my money", on a request to change an address).
 */
describe('the live customer’s opening', () => {
	const items = servicingBook(population(1, { size: 60 })).items;

	it('is the request, for every item in the book, whoever the population drew', () => {
		for (const item of items) {
			const seated = servicingCaseFromItem(createTestClock().random, item, { seat: 'live' });
			expect(seated.counterpart?.opening).toBe(seated.extra.servicing.request.subject);
		}
	});

	it('seats no one unless the host asks for a live customer', () => {
		expect(servicingCaseFromItem(createTestClock().random, items[0]!).counterpart).toBeUndefined();
	});
});
