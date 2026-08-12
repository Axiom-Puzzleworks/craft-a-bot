import { describe, expect, it } from 'vitest';
import { CRAFTABOT_CORE_VERSION } from './index.js';

describe('@craftabot/core', () => {
	it('exports a version stamp', () => {
		expect(CRAFTABOT_CORE_VERSION).toBe('0.0.1');
	});
});
