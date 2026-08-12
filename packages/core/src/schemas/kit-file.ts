import { z } from 'zod';
import { agentSpecSchema } from './agent-spec.js';

/**
 * The kit file — agent export/import (07-DATA-MODEL-PERSISTENCE.md §4).
 * `.passthrough()` preserves unknown fields on round-trip (forward
 * compatibility). Never contains API keys, run history, or user identity.
 */
export const kitFileSchema = z
	.object({
		format: z.literal('craftabot-kit'),
		formatVersion: z.literal(1),
		exportedAt: z.string().datetime(),
		exportedBy: z.string().min(1),
		requires: z.object({
			core: z.string().min(1),
			packs: z.record(z.string(), z.string())
		}),
		agent: agentSpecSchema,
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
export interface MigrationError {
	kind: 'migration-error';
	message: string;
	detectedVersion?: unknown;
}

type KitFileMigration = (raw: Record<string, unknown>) => KitFile | MigrationError;

/**
 * Table-driven by `formatVersion` (07-DATA-MODEL-PERSISTENCE.md §6). Only v1
 * exists today — the identity case — so the pattern is in place before a
 * breaking kit-file shape change ever needs it.
 */
const kitFileMigrations: Record<number, KitFileMigration> = {
	1: (raw) => {
		const result = kitFileSchema.safeParse(raw);
		if (result.success) return result.data;
		return {
			kind: 'migration-error',
			message: `kit file failed v1 validation: ${result.error.message}`
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
