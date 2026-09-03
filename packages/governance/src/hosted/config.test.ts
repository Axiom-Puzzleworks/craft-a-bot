import { describe, expect, it } from 'vitest';
import { hostedScreenConfigSchema } from './config.js';

describe('hostedScreenConfigSchema', () => {
	it("defaults to the Armour Brick's own dials: decision asks, the rest off, fail closed, medium confidence", () => {
		expect(hostedScreenConfigSchema.parse({})).toEqual({
			screenObservation: 'off',
			screenDecision: 'ask',
			screenResult: 'off',
			perCategory: {},
			minConfidence: 'medium',
			onFailure: 'stop-run',
			timeoutMs: 3000,
			offline: false
		});
	});

	it('takes per-category overrides only for known categories, and only block/ask on the decision hook', () => {
		expect(hostedScreenConfigSchema.safeParse({ perCategory: { injection: 'stop' } }).success).toBe(
			true
		);
		expect(hostedScreenConfigSchema.safeParse({ perCategory: { nonsense: 'stop' } }).success).toBe(
			false
		);
		expect(hostedScreenConfigSchema.safeParse({ screenObservation: 'ask' }).success).toBe(false);
		expect(hostedScreenConfigSchema.safeParse({ screenResult: 'block' }).success).toBe(false);
		expect(hostedScreenConfigSchema.safeParse({ timeoutMs: 100 }).success).toBe(false);
	});
});
