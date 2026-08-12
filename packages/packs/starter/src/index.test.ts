import { describe, expect, it } from 'vitest';
import { CRAFTABOT_PACK_STARTER_VERSION } from './index.js';

describe('@craftabot/pack-starter', () => {
	it('exports a version stamp', () => {
		expect(CRAFTABOT_PACK_STARTER_VERSION).toBe('0.0.1');
	});
});
