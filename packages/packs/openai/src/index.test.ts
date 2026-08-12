import { describe, expect, it } from 'vitest';
import { CRAFTABOT_PACK_OPENAI_VERSION } from './index.js';

describe('@craftabot/pack-openai', () => {
	it('exports a version stamp', () => {
		expect(CRAFTABOT_PACK_OPENAI_VERSION).toBe('0.0.1');
	});
});
