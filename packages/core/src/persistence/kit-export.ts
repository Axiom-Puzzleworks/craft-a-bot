import type { AgentSpec } from '../schemas/agent-spec.js';
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
	requires: { core: string; packs: Record<string, string> };
	notes?: string;
	exportedAt?: string;
	/** Belt-and-braces scrub (07 §5); keys should never be in a spec to begin with. */
	secrets?: readonly string[];
}

export function buildKitFile(spec: AgentSpec, options: BuildKitFileOptions): KitFile {
	const kit = {
		format: 'craftabot-kit' as const,
		formatVersion: 1 as const,
		exportedAt: options.exportedAt ?? new Date().toISOString(),
		exportedBy: options.exportedBy,
		requires: { core: options.requires.core, packs: { ...options.requires.packs } },
		agent: spec,
		...(options.notes !== undefined ? { notes: options.notes } : {})
	};
	return kitFileSchema.parse(redactSecrets(kit, options.secrets ?? []));
}

export type ImportProblem =
	| { kind: 'invalid-file'; message: string }
	| { kind: 'missing-packs'; message: string; missing: string[] };

export interface ImportKitFileOptions {
	/** Pack ids currently registered, for the `requires` check. */
	installedPacks: readonly string[];
	/** Ids already on the shelf — a collision means we are importing a copy. */
	existingAgentIds?: readonly string[];
	newId?: () => string;
	now?: () => string;
}

export interface ImportedKit {
	kit: KitFile;
	spec: AgentSpec;
	/** True when the incoming id collided and a fresh one was minted. */
	idWasRegenerated: boolean;
}

/**
 * Validate → check `requires` → copy. An imported bot with a colliding id
 * becomes a *copy* rather than overwriting the original: kits are "traded like
 * real kits" (07 §4), and silently replacing someone's bot would be a rotten
 * way to learn that.
 */
/**
 * `KitFile` is a passthrough object, so `'kind' in value` is true for both
 * members of the union and cannot discriminate. Checking the marker's literal
 * value can — hence the cast.
 */
function isMigrationError(value: KitFile | MigrationError): value is MigrationError {
	return (value as { kind?: unknown }).kind === 'migration-error';
}

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

	const newId = options.newId ?? (() => crypto.randomUUID());
	const now = options.now ?? (() => new Date().toISOString());
	const collides = (options.existingAgentIds ?? []).includes(kit.agent.id);

	const spec: AgentSpec = collides
		? { ...kit.agent, id: newId(), updatedAt: now() }
		: { ...kit.agent };

	return { ok: true, imported: { kit, spec, idWasRegenerated: collides } };
}
