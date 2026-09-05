import { describe, expect, it } from 'vitest';
import pkg from '../package.json';
import { CRAFTABOT_CORE_VERSION } from './version.js';

/**
 * `version.ts` promised "a test holds the two together" (WP52) and none did;
 * WP56 stage B's major bump is when it would first have mattered. The
 * constant is what every `requiresCore` and `requires.core` is evaluated
 * against, and `package.json` is what npm publishes — they must be one number.
 */
describe('CRAFTABOT_CORE_VERSION', () => {
	it('is the version package.json declares', () => {
		expect(CRAFTABOT_CORE_VERSION).toBe(pkg.version);
	});

	it('is 1.0.0 or later — the guardrails lane is gone (WP56, `14-…` §7)', () => {
		expect(Number(CRAFTABOT_CORE_VERSION.split('.')[0])).toBeGreaterThanOrEqual(1);
	});
});
