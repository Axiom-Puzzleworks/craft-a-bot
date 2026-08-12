import { createPackRegistry, type PackRegistry } from '@craftabot/core';
import starterPack from '@craftabot/pack-starter';

/**
 * The explicit pack registry (01-ARCHITECTURE.md §4, 05-TECH-STACK.md §3).
 * Packs are listed here by hand — no dynamic loading, no marketplace, nothing
 * magical. A future private pack installs into the same slot by being added to
 * this list in a private build of the app, which is the whole public/private
 * split mechanism (01 §5).
 *
 * `pack-openai` joins the list in WP7.
 */
export const installedPacks = [starterPack];

export function createRegistry(): PackRegistry {
	const registry = createPackRegistry();
	for (const pack of installedPacks) registry.registerPack(pack);
	return registry;
}

/** Pack ids and versions, for kit-file `requires` blocks and run records. */
export function packVersions(): Record<string, string> {
	return Object.fromEntries(installedPacks.map((pack) => [pack.id, pack.version]));
}
