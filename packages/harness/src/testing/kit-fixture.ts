import { brickKindsFor, buildKitFile, type KitFile } from '@craftabot/core';
import { buildSpec } from '@craftabot/pack-starter/testing';
import { createRegistry, defaultConfig, packVersions } from '../config.js';

/**
 * A full starter bot as a kit file — what the Shelf's Export writes — for
 * the harness's own tests, its key-leak sweep, and `fixtures/snackbot.craftabot.json`.
 *
 * `buildSpec` from the starter pack's testing surface names a test-only
 * cartridge (`test/mock-brain`) that no installed pack registers, which
 * `validateSpec` rightly refuses; a kit a person exports names a real one, so
 * this does too. The scripted brains never call it — the cartridge is what a
 * `--brain live` run would use.
 */
export const FIXTURE_CARTRIDGE = 'openai/quick-thinker';

export function snackbotKit(goalCardId = 'starter/say-hello'): KitFile {
	const config = defaultConfig();
	const registry = createRegistry(config);
	const spec = buildSpec({ goalCardId, tools: ['calculator', 'dice', 'look_up_manual'] });
	if (spec.bricks.llm) spec.bricks.llm.cartridgeId = FIXTURE_CARTRIDGE;
	return buildKitFile(spec, {
		exportedBy: 'craftabot-harness/fixture',
		exportedAt: '2026-09-02T09:00:00.000Z',
		requires: {
			core: '>=0.0.1',
			packs: packVersions(config),
			brickKinds: brickKindsFor(spec, registry)
		}
	});
}
