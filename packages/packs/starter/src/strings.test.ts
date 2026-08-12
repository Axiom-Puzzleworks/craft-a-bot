import { describe, expect, it } from 'vitest';
import { entityName, goalCardStrings, predicateStrings, sentenceCase } from './strings.js';

describe('entityName', () => {
	it('gives the display name for a known entity', () => {
		expect(entityName('teddy')).toBe('Teddy');
	});

	it('falls back to the raw id so nothing ever renders blank', () => {
		expect(entityName('mystery-object')).toBe('mystery-object');
	});
});

describe('sentenceCase', () => {
	it('capitalises the first letter and leaves the rest alone', () => {
		expect(sentenceCase('the toy chest is open')).toBe('The toy chest is open');
	});

	it('copes with an empty string', () => {
		expect(sentenceCase('')).toBe('');
	});
});

describe('copy conventions', () => {
	it('uses UK English spellings in the goal-card copy (10-CODING-STANDARDS.md §4)', () => {
		const copy = Object.values(goalCardStrings)
			.flatMap((card) => [card.title, card.goalText, ...card.hints])
			.join(' ');
		expect(copy).not.toMatch(/\b\w+ize\b/);
		expect(copy).not.toMatch(/\bcolor\b/);
	});

	it('describes every predicate in plain language', () => {
		for (const [id, description] of Object.entries(predicateStrings)) {
			expect(description.length, id).toBeGreaterThan(0);
		}
	});
});
