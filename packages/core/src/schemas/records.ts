import { z } from 'zod';
import { agentSpecSchema } from './agent-spec.js';
import { agentSpecV2Schema, migrateAgentSpec } from './agent-spec-v2.js';
import { buildProblemSchema } from './build-problem.js';
import { engineEventSchema } from './events.js';
import type { MigrationError } from './shared.js';

/**
 * The stored entities (07-DATA-MODEL-PERSISTENCE.md §3). Every one carries a
 * UUID `id`, ISO timestamps, and a `schemaVersion` so a future Supabase sync is
 * additive rather than schema surgery (§1.2). `RunRecord` already lives in
 * trace-file.ts, where the trace export needs it.
 */

/**
 * A shelf item — the spec plus the metadata the box art and build checks need.
 *
 * **v2** (WP14): the spec it holds is spec v2, and `boxArtSeed` has gone. The
 * seed used to live here, on the storage row, which meant a bot exported to a
 * kit file and imported somewhere else arrived *looking like a different bot* —
 * its box art is generated from the seed, and the seed never travelled. It now
 * lives on `spec.identity`, where `14-…` §2.2 says identity belongs: with the
 * agent, not with the shelf it happens to be sitting on.
 */
export const agentRecordSchema = z.object({
	id: z.string().uuid(), // same as spec.id
	spec: agentSpecV2Schema,
	lastValidation: z.array(buildProblemSchema),
	lastRunId: z.string().uuid().optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	schemaVersion: z.literal(2)
});
export type AgentRecord = z.infer<typeof agentRecordSchema>;

/**
 * v1, kept only so the migration has something to parse against.
 *
 * Not exported: nothing should be *writing* one of these, and the way to make
 * that true is to give no one the means.
 */
const agentRecordV1Schema = z.object({
	id: z.string().uuid(),
	spec: agentSpecSchema,
	boxArtSeed: z.string(),
	lastValidation: z.array(buildProblemSchema),
	lastRunId: z.string().uuid().optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	schemaVersion: z.literal(1)
});

type RecordMigration = (raw: Record<string, unknown>) => AgentRecord | MigrationError;

/**
 * v1 → v2. The spec migrates by its own table; the row's job is to hand over
 * the one thing the spec migration could not know.
 *
 * `migrateAgentSpec` leaves `identity.boxArtSeed` empty on purpose — inventing
 * a seed would silently change what an existing bot looks like, and core has no
 * way to guess the right one. Here is where the right one is: the row has been
 * carrying it all along. This is the only place that can join them up, so this
 * is the only place that does.
 */
const migrateV1ToV2: RecordMigration = (raw) => {
	const v1 = agentRecordV1Schema.safeParse(raw);
	if (!v1.success) {
		return {
			kind: 'migration-error',
			message: `agent record failed v1 validation: ${v1.error.message}`
		};
	}

	const spec = migrateAgentSpec(v1.data.spec);
	if ('kind' in spec) return spec;

	const candidate = {
		id: v1.data.id,
		spec: { ...spec, identity: { ...spec.identity, boxArtSeed: v1.data.boxArtSeed } },
		lastValidation: v1.data.lastValidation,
		...(v1.data.lastRunId !== undefined ? { lastRunId: v1.data.lastRunId } : {}),
		createdAt: v1.data.createdAt,
		updatedAt: v1.data.updatedAt,
		schemaVersion: 2
	};

	const result = agentRecordSchema.safeParse(candidate);
	if (result.success) return result.data;
	return {
		kind: 'migration-error',
		message: `agent record failed v2 validation after migration: ${result.error.message}`
	};
};

/** Table-driven by `schemaVersion`, exactly as kit files, specs and traces are (07 §6). */
const recordMigrations: Record<number, RecordMigration> = {
	1: migrateV1ToV2,
	2: (raw) => {
		const result = agentRecordSchema.safeParse(raw);
		if (result.success) return result.data;
		return {
			kind: 'migration-error',
			message: `agent record failed v2 validation: ${result.error.message}`
		};
	}
};

/**
 * Read a stored row of any version we have ever written.
 *
 * Storage calls this rather than `safeParseAgentRecord`, because a shelf full
 * of v1 bots is the *normal* state of anyone who used V1.0 — a straight parse
 * would quarantine every one of them (07 §1.5) and the user would open the app
 * to an empty shelf.
 */
export function migrateAgentRecord(value: unknown): AgentRecord | MigrationError {
	if (typeof value !== 'object' || value === null) {
		return { kind: 'migration-error', message: 'an agent record must be a JSON object' };
	}
	const raw = value as Record<string, unknown>;
	const version = raw['schemaVersion'];
	const migration = typeof version === 'number' ? recordMigrations[version] : undefined;
	if (!migration) {
		const known = Object.keys(recordMigrations).map(Number);
		const newest = Math.max(...known);
		const message =
			typeof version === 'number' && version > newest
				? `This bot is from a newer set! It needs bot format v${version}, and this workbench understands v${newest}.`
				: 'This does not look like a bot — it has no recognisable version.';
		return { kind: 'migration-error', message, detectedVersion: version };
	}
	return migration(raw);
}

/**
 * One row per engine event. `seq` is monotonic per run and is the ordering
 * guarantee the trace depends on — timestamps are not enough, since several
 * events can share a millisecond.
 */
export const storedEventSchema = z.object({
	runId: z.string().uuid(),
	seq: z.number().int().nonnegative(),
	event: engineEventSchema
});
export type StoredEvent = z.infer<typeof storedEventSchema>;

export function parseAgentRecord(value: unknown): AgentRecord {
	return agentRecordSchema.parse(value);
}

export function safeParseAgentRecord(
	value: unknown
): ReturnType<typeof agentRecordSchema.safeParse> {
	return agentRecordSchema.safeParse(value);
}

export function safeParseStoredEvent(
	value: unknown
): ReturnType<typeof storedEventSchema.safeParse> {
	return storedEventSchema.safeParse(value);
}
