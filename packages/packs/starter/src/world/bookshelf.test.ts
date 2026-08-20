import { describe, expect, it } from 'vitest';
import { BOOKS, bookshelf, searchBook } from './bookshelf.js';

describe('the bookshelf', () => {
	it('gives every entry a unique id, a real book, keywords, and text', () => {
		const ids = bookshelf.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
		const bookIds = BOOKS.map((book) => book.id);
		for (const entry of bookshelf) {
			expect(bookIds).toContain(entry.book);
			expect(entry.keywords.length).toBeGreaterThan(0);
			expect(entry.text.length).toBeGreaterThan(0);
		}
	});

	it('keeps every keyword lower-case so matching is predictable', () => {
		for (const entry of bookshelf) {
			for (const keyword of entry.keywords) {
				expect(keyword).toBe(keyword.toLowerCase());
			}
		}
	});

	it('carries at least one entry per book, so a fitted book is never empty', () => {
		for (const book of BOOKS) {
			expect(bookshelf.some((entry) => entry.book === book.id)).toBe(true);
		}
	});
});

describe('searchBook', () => {
	it('finds an entry in the book it belongs to, however the question is capitalised', () => {
		expect(
			searchBook('games', 'How do you play HIDE and seek?').map((entry) => entry.id)
		).toContain('hide-and-seek');
	});

	it('never returns an entry from a different book', () => {
		// "hide-and-seek" lives in `games`; asking `history` the same question
		// must come back empty, not fall through to the other book's content.
		expect(searchBook('history', 'how do you play hide and seek?')).toEqual([]);
	});

	it('returns nothing for a question its own book cannot answer', () => {
		expect(searchBook('games', 'what is the capital of France')).toEqual([]);
	});
});
