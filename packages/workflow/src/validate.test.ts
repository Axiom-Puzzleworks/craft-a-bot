import { describe, expect, it } from 'vitest';
import { validateAgainst } from './validate.js';

describe('validateAgainst', () => {
	it('checks type, required, properties, enum, const, items and closed objects', () => {
		const schema = {
			type: 'object',
			required: ['id', 'tags'],
			properties: {
				id: { type: 'string' },
				n: { type: 'integer' },
				kind: { enum: ['a', 'b'] },
				tags: { type: 'array', items: { type: 'string' } },
				version: { const: 1 },
				maybe: { type: ['number', 'null'] }
			},
			additionalProperties: false
		};
		expect(
			validateAgainst(schema, { id: 'x', tags: ['t'], kind: 'a', version: 1, n: 2, maybe: null })
		).toEqual([]);
		expect(
			validateAgainst(schema, { id: 1, tags: [2], kind: 'c', version: 2, n: 1.5, extra: true })
		).toEqual([
			'$.id: expected string, got number',
			'$.n: expected integer, got number',
			'$.kind: expected one of "a", "b"',
			'$.tags[0]: expected string, got number',
			'$.version: expected the constant 1',
			'$.extra: not allowed'
		]);
		expect(validateAgainst(schema, { id: 'x' })).toEqual(['$.tags: required']);
		expect(validateAgainst(schema, [])).toEqual(['$: expected object, got array']);
		expect(validateAgainst({ type: 'null' }, null)).toEqual([]);
		expect(validateAgainst({ type: 'boolean' }, 'no')).toEqual(['$: expected boolean, got string']);
		expect(validateAgainst({ type: ['string', 'number'] }, true)).toEqual([
			'$: expected string | number, got boolean'
		]);
	});

	it('passes anything an open schema allows', () => {
		expect(validateAgainst({}, 42)).toEqual([]);
		expect(validateAgainst({ type: 'mystery' }, 42)).toEqual([]);
		expect(validateAgainst({ type: 'number' }, Number.NaN)).toEqual([
			'$: expected number, got number'
		]);
	});
});
