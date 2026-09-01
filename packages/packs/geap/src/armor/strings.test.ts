import { describe, expect, it } from 'vitest';
import type { ArmorErrorKind } from './errors.js';
import { composeMatchReason, transportReason } from './strings.js';

describe('composeMatchReason', () => {
	it('composes the two-match example from the design doc verbatim', () => {
		expect(
			composeMatchReason([{ key: 'injection', confidence: 'HIGH' }, { key: 'sensitiveData' }])
		).toBe('the guard spotted a sneaky instruction (very sure) and a secret');
	});

	it('composes a single match with no trailing "and"', () => {
		expect(composeMatchReason([{ key: 'maliciousUri' }])).toBe(
			'the guard spotted a dangerous link'
		);
	});

	it('composes three or more matches with a serial comma before "and"', () => {
		expect(composeMatchReason([{ key: 'hate' }, { key: 'harassment' }, { key: 'dangerous' }])).toBe(
			'the guard spotted hateful language, harassing language and something dangerous'
		);
	});
});

describe('transportReason', () => {
	const KINDS: ArmorErrorKind[] = [
		'bad-token',
		'no-permission',
		'no-template',
		'quota',
		'timeout',
		'unavailable'
	];

	it.each(KINDS)('has a non-empty reason for every closed error kind: %s', (kind) => {
		expect(transportReason(kind).length).toBeGreaterThan(0);
	});
});
