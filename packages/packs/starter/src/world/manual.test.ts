import { describe, expect, it } from 'vitest';
import { playroomManual, searchManual } from './manual.js';

describe('the Playroom manual', () => {
	it('gives every entry a unique id, keywords, and text', () => {
		const ids = playroomManual.map((entry) => entry.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const entry of playroomManual) {
			expect(entry.keywords.length).toBeGreaterThan(0);
			expect(entry.text.length).toBeGreaterThan(0);
		}
	});

	it('holds the fact the locked-chest card is built around', () => {
		const chest = playroomManual.find((entry) => entry.id === 'toy-chest');
		expect(chest?.text).toContain('red key');
	});

	it('keeps every keyword lower-case so matching is predictable', () => {
		for (const entry of playroomManual) {
			for (const keyword of entry.keywords) {
				expect(keyword).toBe(keyword.toLowerCase());
			}
		}
	});
});

describe('searchManual', () => {
	it('finds the chest entry however the question is capitalised', () => {
		expect(searchManual('How do I open the CHEST?').map((entry) => entry.id)).toContain(
			'toy-chest'
		);
	});

	it('returns nothing for a question the playroom cannot answer', () => {
		expect(searchManual('what is the capital of France')).toEqual([]);
	});

	it('can return several entries when a question touches several things', () => {
		expect(searchManual('is the key in the chest?').length).toBeGreaterThan(1);
	});
});
