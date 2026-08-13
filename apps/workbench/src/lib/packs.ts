import { createPackRegistry, type PackRegistry } from '@craftabot/core';
import openAiPack from '@craftabot/pack-openai';
import starterPack from '@craftabot/pack-starter';
import { demoPack } from './demo-pack.js';

/**
 * The explicit pack registry (01-ARCHITECTURE.md §4, 05-TECH-STACK.md §3).
 * Packs are listed here by hand — no dynamic loading, no marketplace, nothing
 * magical. A future private pack installs into the same slot by being added to
 * this list in a private build of the app, which is the whole public/private
 * split mechanism (01 §5).
 */
export const installedPacks = [starterPack, openAiPack, demoPack];

export function createRegistry(): PackRegistry {
	const registry = createPackRegistry();
	for (const pack of installedPacks) registry.registerPack(pack);
	return registry;
}

/** Pack ids and versions, for kit-file `requires` blocks and run records. */
export function packVersions(): Record<string, string> {
	return Object.fromEntries(installedPacks.map((pack) => [pack.id, pack.version]));
}

/**
 * Every brick kind this build can assemble, for the kit-file `requires` check.
 *
 * Read from the packs rather than the registry because import happens before
 * anything has been built — there is no bench, and no reason to stand a
 * registry up to answer one question.
 */
export function installedBrickKinds(): string[] {
	return installedPacks.flatMap((pack) => (pack.brickKinds ?? []).map((kind) => kind.id));
}
