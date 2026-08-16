import type { BrickKindDefinition } from './types/brick.js';

/**
 * **Running a brick's own config migration** (`14-…` §2, WP24).
 *
 * `BrickKindDefinition.configVersion`/`migrateConfig` were part of the open
 * brick contract from the start — a kind versions its config the way a kit
 * file versions itself (`07-…` §6) — but nothing ever called `migrateConfig`:
 * every kind shipped at `configVersion: 1` until the Safety Brick's v2 config
 * (`14-…` §4.6) needed it for real. This is that missing piece, small and
 * generic because the contract already did the design work: walk the table
 * from the version the spec was written at up to the version the installed
 * kind expects, and stop at the first missing step rather than guess.
 *
 * Called wherever a fitted brick's raw config is about to meet its kind's
 * `configSchema` — `validateSpecV2` and `buildRuntimes` — so a kit file
 * written against an older config shape parses exactly as if it had been
 * saved today.
 */
export function migrateBrickConfig(
	raw: Record<string, unknown>,
	fromVersion: number,
	kind: Pick<BrickKindDefinition, 'configVersion' | 'migrateConfig'>
): Record<string, unknown> {
	let config = raw;
	for (let version = fromVersion; version < kind.configVersion; version++) {
		const step = kind.migrateConfig?.[version];
		if (!step) break;
		config = step(config);
	}
	return config;
}
