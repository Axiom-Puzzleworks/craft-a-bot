import type { PackRegistry } from '../pack-registry.js';
import { toSpecV2, type AgentSpecV2, type AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import {
	kitFileSchema,
	migrateKitFile,
	type KitFile,
	type MigrationError
} from '../schemas/kit-file.js';
import { redactSecrets } from './redact.js';

/**
 * Kit files — how a bot leaves and re-enters the app (07-DATA-MODEL-PERSISTENCE.md §4).
 * A kit file is safe to share publicly by construction: it carries the spec and
 * nothing else. No keys, no run history, no user identity.
 */

export interface BuildKitFileOptions {
	/** e.g. "craftabot-workbench/1.0.0". */
	exportedBy: string;
	/**
	 * What the reader needs installed. `packs` and `brickKinds` are supplied by
	 * the caller rather than looked up here, because the caller is what holds a
	 * registry — `brickKindsFor` turns one into the map this wants.
	 */
	requires: { core: string; packs: Record<string, string>; brickKinds: Record<string, string> };
	notes?: string;
	exportedAt?: string;
	/** Belt-and-braces scrub (07 §5); keys should never be in a spec to begin with. */
	secrets?: readonly string[];
}

/**
 * Which pack provides each kind this bot is built from — the `requires.brickKinds`
 * map, taken from the registry rather than inferred from the ids.
 *
 * A kind whose pack is not registered is skipped rather than guessed at: the
 * export is being made *by* someone who has the pack, so an unknown kind here
 * means the spec names a brick that is not installed, which is a build problem
 * the ribbon is already reporting. Writing a plausible-looking pack id would
 * turn that into an import failure on someone else's machine, blamed on them.
 */
export function brickKindsFor(spec: AnyAgentSpec, registry: PackRegistry): Record<string, string> {
	const kinds: Record<string, string> = {};
	for (const brick of toSpecV2(spec).bricks) {
		const packId = registry.getBrickKindPack(brick.kind);
		if (packId !== undefined) kinds[brick.kind] = packId;
	}
	return kinds;
}

export function buildKitFile(spec: AnyAgentSpec, options: BuildKitFileOptions): KitFile {
	const kit = {
		format: 'craftabot-kit' as const,
		formatVersion: 2 as const,
		exportedAt: options.exportedAt ?? new Date().toISOString(),
		exportedBy: options.exportedBy,
		requires: {
			core: options.requires.core,
			packs: { ...options.requires.packs },
			brickKinds: { ...options.requires.brickKinds }
		},
		agent: toSpecV2(spec),
		...(options.notes !== undefined ? { notes: options.notes } : {})
	};
	return kitFileSchema.parse(redactSecrets(kit, options.secrets ?? []));
}

export type ImportProblem =
	| { kind: 'invalid-file'; message: string }
	| { kind: 'missing-packs'; message: string; missing: string[] }
	/** The pack is installed, but at a version without the brick this bot uses. */
	| { kind: 'missing-bricks'; message: string; missing: string[]; packs: string[] };

export interface ImportKitFileOptions {
	/** Pack ids currently registered, for the `requires` check. */
	installedPacks: readonly string[];
	/**
	 * Brick kind ids currently registered.
	 *
	 * Optional, and omitting it skips the check rather than failing it: a caller
	 * that cannot answer the question should not be made to answer it wrongly.
	 */
	installedBrickKinds?: readonly string[];
	/** Ids already on the shelf — a collision means we are importing a copy. */
	existingAgentIds?: readonly string[];
	newId?: () => string;
	now?: () => string;
}

export interface ImportedKit {
	kit: KitFile;
	spec: AgentSpecV2;
	/** True when the incoming id collided and a fresh one was minted. */
	idWasRegenerated: boolean;
}

/**
 * `KitFile` is a passthrough object, so `'kind' in value` is true for both
 * members of the union and cannot discriminate. Checking the marker's literal
 * value can — hence the cast.
 */
function isMigrationError(value: KitFile | MigrationError): value is MigrationError {
	return (value as { kind?: unknown }).kind === 'migration-error';
}

/**
 * Validate → check `requires` → copy. An imported bot with a colliding id
 * becomes a *copy* rather than overwriting the original: kits are "traded like
 * real kits" (07 §4), and silently replacing someone's bot would be a rotten
 * way to learn that.
 *
 * The packs check comes first and the bricks check second, because "you need
 * the space pack" is a more useful sentence than a list of six bricks that all
 * come from it. Only when every named pack *is* installed does a missing brick
 * mean what it says: the pack is there, at a version too old for this bot.
 */
export function importKitFile(
	json: unknown,
	options: ImportKitFileOptions
): { ok: true; imported: ImportedKit } | { ok: false; problem: ImportProblem } {
	const migrated = migrateKitFile(json);
	if (isMigrationError(migrated)) {
		return { ok: false, problem: { kind: 'invalid-file', message: migrated.message } };
	}

	const kit = migrated;
	const required = Object.keys(kit.requires.packs);
	const missing = required.filter((packId) => !options.installedPacks.includes(packId));
	if (missing.length > 0) {
		return {
			ok: false,
			problem: {
				kind: 'missing-packs',
				message: `This bot uses parts from ${missing.length === 1 ? 'an expansion' : 'expansions'} you do not have: ${missing.join(', ')}.`,
				missing
			}
		};
	}

	if (options.installedBrickKinds !== undefined) {
		const installed = options.installedBrickKinds;
		const missingKinds = Object.keys(kit.requires.brickKinds).filter(
			(kindId) => !installed.includes(kindId)
		);
		if (missingKinds.length > 0) {
			const packs = [...new Set(missingKinds.map((kindId) => kit.requires.brickKinds[kindId]!))];
			return {
				ok: false,
				problem: {
					kind: 'missing-bricks',
					message: `This bot has ${missingKinds.length === 1 ? 'a brick' : 'bricks'} your set does not include: ${missingKinds.join(', ')}. ${packs.length === 1 ? `It comes from ${packs[0]}` : `They come from ${packs.join(', ')}`} — you may need a newer version.`,
					missing: missingKinds,
					packs
				}
			};
		}
	}

	const newId = options.newId ?? (() => crypto.randomUUID());
	const now = options.now ?? (() => new Date().toISOString());
	const collides = (options.existingAgentIds ?? []).includes(kit.agent.id);

	const spec: AgentSpecV2 = collides
		? { ...kit.agent, id: newId(), updatedAt: now() }
		: { ...kit.agent };

	return { ok: true, imported: { kit, spec, idWasRegenerated: collides } };
}
