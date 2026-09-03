import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CRAFTABOT_CORE_VERSION } from '@craftabot/core';

/**
 * `CRAFTABOT_CORE_VERSION` is what core's `package.json` says (WP52,
 * `40-DEBTS.md` §4.2) — checked here, where Node's file system is in
 * scope, so a pack's `requiresCore` is held to the real version.
 */
describe('CRAFTABOT_CORE_VERSION', () => {
	it('matches packages/core/package.json', () => {
		const manifest = JSON.parse(
			readFileSync(new URL('../../core/package.json', import.meta.url), 'utf8')
		) as { version: string };
		expect(CRAFTABOT_CORE_VERSION).toBe(manifest.version);
	});
});
