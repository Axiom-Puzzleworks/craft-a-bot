import { describe, expect, it } from 'vitest';
import kitV1 from '../fixtures/kit-file.v1.valid.json';
import kitV2 from '../fixtures/kit-file.v2.valid.json';
import { CRAFTABOT_CORE_VERSION } from '../version.js';
import { importKitFile } from './kit-export.js';

/**
 * The fixture `14-…` §7 asks for with a major bump (WP56 stage B): every
 * shipped kit file still imports at the core version this build declares.
 * Ranges are evaluated (WP52), so a fixture written for 0.x that said
 * `<1.0.0` would refuse here.
 */
describe('shipped kit files at the current core version', () => {
	for (const [name, kit] of [
		['kit-file.v1.valid.json', kitV1],
		['kit-file.v2.valid.json', kitV2]
	] as const) {
		it(`${name} imports at core ${CRAFTABOT_CORE_VERSION}`, () => {
			const requires = (kit as { requires?: { packs?: Record<string, string> } }).requires;
			const result = importKitFile(kit, {
				installedPacks: Object.keys(requires?.packs ?? {}),
				coreVersion: CRAFTABOT_CORE_VERSION
			});
			expect(result).toMatchObject({ ok: true });
		});
	}
});
