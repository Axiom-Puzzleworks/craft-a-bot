import {
	CRAFTABOT_CORE_VERSION,
	createPackRegistry,
	packManifestMetadataSchema,
	satisfiesRange,
	type PackManifest
} from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/**
 * "Manifest validates; ids qualified and collision-free" (`13-…` §7).
 *
 * The metadata shape parses, every id the pack registers is qualified
 * `{packId}/{localId}`, registering it (alongside whatever companions it
 * needs) does not collide with anything — and, since WP52, `requiresCore`
 * and `requiresPacks` are evaluated as ranges (`13-…` §7's D13 bullet).
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
	for (const service of manifest.guardrailServices ?? []) {
		if (!service.id.startsWith(prefix)) unqualified.push(`guardrailService "${service.id}"`);
	}
	for (const evaluator of manifest.evaluators ?? []) {
		if (!evaluator.id.startsWith(prefix)) unqualified.push(`evaluator "${evaluator.id}"`);
	}
	for (const card of manifest.assertionCards ?? []) {
		if (!card.id.startsWith(prefix)) unqualified.push(`assertionCard "${card.id}"`);
	}
	for (const scenario of manifest.scenarios ?? []) {
		if (!scenario.id.startsWith(prefix)) unqualified.push(`scenario "${scenario.id}"`);
	}
	if (unqualified.length > 0) {
		issues.push({
			check: 'manifest.ids-qualified',
			message: `ids not prefixed "${prefix}" (the "{packId}/{localId}" convention, E6): ${unqualified.join(', ')}`
		});
	}

	// "Semver ranges evaluated (D13)" — the bullet `13-…` §7 left unchecked until WP52.
	const unmet: string[] = [];
	if (!satisfiesRange(CRAFTABOT_CORE_VERSION, manifest.requiresCore)) {
		unmet.push(`core ${manifest.requiresCore} (this is core ${CRAFTABOT_CORE_VERSION})`);
	}
	for (const [needed, range] of Object.entries(manifest.requiresPacks ?? {})) {
		const companion = (options.companionPacks ?? []).find((pack) => pack.id === needed);
		if (!companion) unmet.push(`pack "${needed}" ${range} (not among the companion packs)`);
		else if (!satisfiesRange(companion.version, range))
			unmet.push(`pack "${needed}" ${range} (companion is ${companion.version})`);
	}
	if (unmet.length > 0) {
		issues.push({
			check: 'manifest.requires-satisfied',
			message: `requirements not met: ${unmet.join('; ')}`
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
