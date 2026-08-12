import { describe, expect, it } from 'vitest';
import { REDACTED, containsSecret, redactSecrets } from './redact.js';

describe('redactSecrets', () => {
	it('replaces a secret wherever it appears, at any depth', () => {
		const value = {
			top: 'sk-secret',
			nested: { deeper: ['sk-secret', { deepest: 'sk-secret' }] }
		};
		expect(redactSecrets(value, ['sk-secret'])).toEqual({
			top: REDACTED,
			nested: { deeper: [REDACTED, { deepest: REDACTED }] }
		});
	});

	it('leaves everything else alone, including strings that merely contain the secret', () => {
		const value = { keep: 'this', mentions: 'my key is sk-secret', count: 42, flag: true };
		expect(redactSecrets(value, ['sk-secret'])).toEqual(value);
	});

	it('handles several secrets at once', () => {
		expect(redactSecrets(['a-key', 'b-key', 'safe'], ['a-key', 'b-key'])).toEqual([
			REDACTED,
			REDACTED,
			'safe'
		]);
	});

	it('ignores empty and whitespace-only secrets, so an unset key blanks nothing', () => {
		const value = { empty: '', spaced: '   ', real: 'x' };
		expect(redactSecrets(value, ['', '   '])).toEqual(value);
	});

	it('returns a copy, never a live reference', () => {
		const value = { nested: { list: [1, 2] } };
		const result = redactSecrets(value, ['sk-secret']);
		result.nested.list.push(3);
		expect(value.nested.list).toEqual([1, 2]);
	});

	it('copes with nulls and primitives', () => {
		expect(redactSecrets(null, ['x'])).toBeNull();
		expect(redactSecrets(7, ['x'])).toBe(7);
		expect(redactSecrets('x', ['x'])).toBe(REDACTED);
	});
});

describe('containsSecret', () => {
	it('finds a secret at any depth', () => {
		expect(containsSecret({ a: { b: ['sk-secret'] } }, ['sk-secret'])).toBe(true);
	});

	it('is false when nothing matches, or when there are no secrets to look for', () => {
		expect(containsSecret({ a: 'safe' }, ['sk-secret'])).toBe(false);
		expect(containsSecret({ a: 'sk-secret' }, [])).toBe(false);
		expect(containsSecret({ a: 'sk-secret' }, ['  '])).toBe(false);
	});

	it('catches a secret embedded inside a longer string — a leak is a leak', () => {
		expect(containsSecret({ note: 'bearer sk-secret here' }, ['sk-secret'])).toBe(true);
	});

	it('copes with values JSON cannot serialise', () => {
		expect(containsSecret(undefined, ['sk-secret'])).toBe(false);
		expect(containsSecret(() => 'sk-secret', ['sk-secret'])).toBe(false);
	});
});
