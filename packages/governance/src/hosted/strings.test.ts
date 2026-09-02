import { describe, expect, it } from 'vitest';
import { defaultHostedStrings, joinWithAnd } from './strings.js';

describe('the default strings', () => {
	it('compose a match reason from categories and confidences, in the toy vocabulary', () => {
		expect(
			defaultHostedStrings.match([
				{ category: 'injection', vendorLabel: 'pi', confidence: 'high' },
				{ category: 'sensitive-data', vendorLabel: 'sdp' },
				{ category: 'other', vendorLabel: 'x', confidence: 'low' }
			])
		).toBe(
			'the guard spotted a sneaky instruction (very sure), a secret and something it did not like (maybe)'
		);
	});

	it('have a line for every transport kind', () => {
		for (const kind of [
			'bad-token',
			'no-permission',
			'no-template',
			'quota',
			'timeout',
			'unavailable'
		] as const) {
			expect(defaultHostedStrings.transport(kind)).toMatch(/^the guard could not check/);
		}
	});
});

describe('joinWithAnd', () => {
	it('joins none, one, two and many', () => {
		expect(joinWithAnd([])).toBe('');
		expect(joinWithAnd(['a'])).toBe('a');
		expect(joinWithAnd(['a', 'b'])).toBe('a and b');
		expect(joinWithAnd(['a', 'b', 'c'])).toBe('a, b and c');
	});
});
