import { contentRecordSchema } from './content.js';
import { z } from 'zod';
import { agentSpecV2Schema, migrateAgentSpec } from './agent-spec-v2.js';
import type { MigrationError } from './shared.js';

/**
 * The kit file — agent export/import (07-DATA-MODEL-PERSISTENCE.md §4).
 * `.passthrough()` preserves unknown fields on round-trip (forward
 * compatibility). Never contains API keys, run history, or user identity.
 *
 * **v2** (WP14) carries spec v2 and adds `requires.brickKinds`. v1 could only
 * say which *packs* a bot needed, which was enough when the six bricks were
 * baked into the schema and every pack shipped all of them. Once a pack can add
 * a seventh brick, "you need the starter pack" stops being the answer to "why
 * can I not open this bot": the reader has the pack, at a version without the
 * brick. Naming the kinds lets import say which brick is missing and which pack
 * to go and get.
 */
export const kitFileSchema = z
	.object({
		format: z.literal('craftabot-kit'),
		formatVersion: z.literal(2),
		exportedAt: z.string().datetime(),
		exportedBy: z.string().min(1),
		requires: z.object({
			core: z.string().min(1),
			packs: z.record(z.string(), z.string()),
			/**
			 * Every brick kind this bot is built from, mapped to the pack that
			 * provides it — `{"starter/llm": "starter"}`.
			 *
			 * Derivable from the id today, since kinds are conventionally named
			 * `pack/kind`. Recorded anyway, because the convention is a convention:
			 * the registry is what actually knows who registered what, and a kit
			 * file that guesses would be wrong exactly when it mattered.
			 */
			brickKinds: z.record(z.string(), z.string()),
			/** Authored cards this bot fits (WP46, `34-…` §4.3) — embedded, since no other machine has them. */
			localContent: z.array(contentRecordSchema).optional()
		}),
		agent: agentSpecV2Schema,
		notes: z.string().optional()
	})
	.passthrough();

export type KitFile = z.infer<typeof kitFileSchema>;

export function parseKitFile(value: unknown): KitFile {
	return kitFileSchema.parse(value);
}

export function safeParseKitFile(value: unknown): ReturnType<typeof kitFileSchema.safeParse> {
	return kitFileSchema.safeParse(value);
}

/** Typed error per 10-CODING-STANDARDS.md §1 — never thrown as a string. */
export type { MigrationError };

type KitFileMigration = (raw: Record<string, unknown>) => KitFile | MigrationError;

/**
 * v1 → v2: migrate the embedded spec, and work out `brickKinds` from what comes
 * back.
 *
 * A v1 kit could only ever hold the six starter bricks — the key names were in
 * the schema — so the kinds are exactly the ones the spec migration produced,
 * and the pack for each is the segment before the slash. That inference is
 * sound *here*, on files that predate expansion packs, and nowhere else; the
 * export path asks the registry instead.
 */
function migrateV1ToV2(raw: Record<string, unknown>): KitFile | MigrationError {
	const v1 = kitFileV1Schema.safeParse(raw);
	if (!v1.success) {
		return {
			kind: 'migration-error',
			message: `kit file failed v1 validation: ${v1.error.message}`
		};
	}

	const agent = migrateAgentSpec(v1.data.agent);
	if ('kind' in agent) return agent;

	const brickKinds = Object.fromEntries(
		agent.bricks.map((brick) => [brick.kind, brick.kind.split('/')[0] ?? brick.kind])
	);

	const result = kitFileSchema.safeParse({
		...v1.data,
		formatVersion: 2,
		requires: { ...v1.data.requires, brickKinds },
		agent
	});
	if (result.success) return result.data;
	return {
		kind: 'migration-error',
		message: `kit file failed v2 validation after migration: ${result.error.message}`
	};
}

/** v1, kept only so the migration has something to parse against. */
const kitFileV1Schema = z
	.object({
		format: z.literal('craftabot-kit'),
		formatVersion: z.literal(1),
		exportedAt: z.string().datetime(),
		exportedBy: z.string().min(1),
		requires: z.object({
			core: z.string().min(1),
			packs: z.record(z.string(), z.string())
		}),
		agent: z.record(z.string(), z.unknown()),
		notes: z.string().optional()
	})
	.passthrough();

/**
 * Table-driven by `formatVersion` (07-DATA-MODEL-PERSISTENCE.md §6). The
 * pattern was in place before it was needed, which is why v2 is a table entry
 * rather than a rewrite.
 */
const kitFileMigrations: Record<number, KitFileMigration> = {
	1: migrateV1ToV2,
	2: (raw) => {
		const result = kitFileSchema.safeParse(raw);
		if (result.success) return result.data;
		return {
			kind: 'migration-error',
			message: `kit file failed v2 validation: ${result.error.message}`
		};
	}
};

export function migrateKitFile(value: unknown): KitFile | MigrationError {
	if (typeof value !== 'object' || value === null) {
		return { kind: 'migration-error', message: 'kit file must be a JSON object' };
	}
	const raw = value as Record<string, unknown>;
	const version = raw['formatVersion'];
	const migration = typeof version === 'number' ? kitFileMigrations[version] : undefined;
	if (!migration) {
		// 03-UI-UX-DESIGN.md §9 asks for this in kit language, with the version
		// details kept rather than swallowed: a file from a *newer* set is a
		// different situation from a file that is simply broken, and the reader
		// can do something about the first one.
		const known = Object.keys(kitFileMigrations).map(Number);
		const newest = Math.max(...known);
		const message =
			typeof version === 'number' && version > newest
				? `This kit is from a newer set! It needs kit format v${version}, and this workbench understands v${newest}.`
				: 'This does not look like a kit file — it has no recognisable format version.';
		return { kind: 'migration-error', message, detectedVersion: version };
	}
	return migration(raw);
}
