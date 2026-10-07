import { describe, expect, it } from 'vitest';
import { requestTimeoutFromEnv } from './campaign.js';

/** The host's per-request timeout for a slow live model (plan 113 §12): a positive number of milliseconds, else the floor. */
describe('requestTimeoutFromEnv', () => {
	it('reads a positive number of milliseconds', () => {
		expect(requestTimeoutFromEnv({ CRAFTABOT_REQUEST_TIMEOUT_MS: '180000' })).toBe(180_000);
	});
	it('is absent, for the floor, when unset, zero, negative or not a number', () => {
		expect(requestTimeoutFromEnv({})).toBeUndefined();
		for (const value of ['0', '-5', 'soon', ''])
			expect(requestTimeoutFromEnv({ CRAFTABOT_REQUEST_TIMEOUT_MS: value })).toBeUndefined();
	});
});
