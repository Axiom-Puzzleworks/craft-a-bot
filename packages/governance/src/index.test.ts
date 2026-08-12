import { describe, expect, it } from 'vitest';
import { CRAFTABOT_GOVERNANCE_VERSION } from './index.js';

describe('@craftabot/governance', () => {
	it('exports a version stamp', () => {
		expect(CRAFTABOT_GOVERNANCE_VERSION).toBe('0.0.1');
	});
});
