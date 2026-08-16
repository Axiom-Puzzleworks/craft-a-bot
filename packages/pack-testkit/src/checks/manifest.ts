import { createPackRegistry, packManifestMetadataSchema, type PackManifest } from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/**
 * "Manifest validates; ids qualified and collision-free" (`13-…` §7).
 *
 * Semver range evaluation is deliberately not checked here — see the module
 * doc comment in `../types.ts` and the dated amendment in `13-…` §7. This
 * checks what the codebase actually does today: the metadata shape parses,
 * every id the pack registers is qualified `{packId}/{localId}`, and
 * registering it (alongside whatever companions it needs) does not collide
 * with anything.
 */
export function checkManifest(
	manifest: PackManifest,
	options: { companionPacks?: PackManifest[] } = {}
): ConformanceIssue[] {
	const issues: ConformanceIssue[] = [];

	const parsedMeta = packManifestMetadataSchema.safeParse(manifest);
	if (!parsedMeta.success) {
		issues.push({
			check: 'manifest.metadata-valid',
			message: `pack metadata does not validate: ${parsedMeta.error.message}`
		});
	}

	const prefix = `${manifest.id}/`;
	const unqualified: string[] = [];
	for (const kind of manifest.brickKinds ?? []) {
		if (!kind.id.startsWith(prefix)) unqualified.push(`brickKind "${kind.id}"`);
	}
	for (const tool of manifest.tools ?? []) {
		if (!tool.id.startsWith(prefix)) unqualified.push(`tool "${tool.id}"`);
	}
	for (const cartridge of manifest.cartridges ?? []) {
		if (!cartridge.id.startsWith(prefix)) unqualified.push(`cartridge "${cartridge.id}"`);
	}
	for (const goalCard of manifest.goalCards ?? []) {
		if (!goalCard.id.startsWith(prefix)) unqualified.push(`goalCard "${goalCard.id}"`);
	}
	for (const world of manifest.worlds ?? []) {
		if (!world.id.startsWith(prefix)) unqualified.push(`world "${world.id}"`);
	}
	for (const card of manifest.policyCards ?? []) {
		if (!card.id.startsWith(prefix)) unqualified.push(`policyCard "${card.id}"`);
	}
	if (unqualified.length > 0) {
		issues.push({
			check: 'manifest.ids-qualified',
			message: `ids not prefixed "${prefix}" (the "{packId}/{localId}" convention, E6): ${unqualified.join(', ')}`
		});
	}

	try {
		const registry = createPackRegistry();
		for (const companion of options.companionPacks ?? []) registry.registerPack(companion);
		registry.registerPack(manifest);
	} catch (error) {
		issues.push({
			check: 'manifest.collision-free',
			message: error instanceof Error ? error.message : String(error)
		});
	}

	return issues;
}
