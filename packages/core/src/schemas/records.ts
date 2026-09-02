import { z } from 'zod';
export {
	evaluationRecordSchema,
	evaluationResultSchema,
	safeParseEvaluationRecord,
	type EvaluationRecord,
	type EvaluationResultRecord
} from './evaluation.js';
import { agentSpecSchema } from './agent-spec.js';
import { agentSpecV2Schema, migrateAgentSpec } from './agent-spec-v2.js';
import { buildProblemSchema } from './build-problem.js';
import { engineEventSchema } from './events.js';
import { runOutcomeSchema, type MigrationError, usageSchema } from './shared.js';

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

/**
 * A group episode's own row (WP29, `23-MULTI-AGENT-DESIGN.md` §4.7, §10 stage F)
 * — "a lightweight `GroupRunRecord`... stored alongside" every member's own
 * unwidened `RunRecord`, so the Run Browser can list an episode without
 * scanning and joining every member row to find one.
 *
 * `id` is the group's own `groupRunId` — the same id the merged stream is
 * stored under via the ordinary `appendEvents(id, mergedEvents)`, and the same
 * id every member's own `RunRecord.groupRunId` points back to. No
 * `specSnapshot`, no single `providerId`/`wireModel`/`budgets`: a group has
 * several of each, one per member, already on that member's own record.
 */
export const groupRunRecordSchema = z.object({
	id: z.string().uuid(),
	goalCardId: z.string().min(1),
	memberRunIds: z.array(z.string().uuid()),
	memberAgentIds: z.array(z.string().uuid()),
	/** The record's own "still going" state, exactly as `RunRecord.outcome` widens (E5). */
	outcome: z.union([runOutcomeSchema, z.literal('IN_PROGRESS')]),
	rounds: z.number().int().nonnegative(),
	usage: usageSchema,
	pinned: z.boolean(),
	startedAt: z.string().datetime(),
	finishedAt: z.string().datetime().optional(),
	schemaVersion: z.literal(1)
});
export type GroupRunRecord = z.infer<typeof groupRunRecordSchema>;

/**
 * **What a finished run adds up to** (WP36 stage C, `26-TARGET-DESIGN-V3.md`
 * §6.14) — the per-run facts the Workshop's fleet, incident, telemetry and
 * safety-case screens need, folded once from the events when the run ends
 * and stored beside its `RunRecord`, so a dashboard over N runs is N small
 * reads rather than N whole traces. Everything here is derivable from the
 * trace and nothing else (`14-…` §1 tenet 4); the trace stays the source of
 * truth and a summary is a cache of it, never authored.
 *
 * `findings` carries the incident log's own per-event lines verbatim so the
 * log can be listed without re-reading a single trace; a run with none is a
 * run that never went wrong.
 */
export const runSummaryFindingSchema = z.object({
	kind: z.enum(['error', 'guardrail-catch', 'action-failure', 'approval-denied', 'run-failure']),
	tick: z.number().int().nonnegative(),
	/** One line, drawn from the event's own payload — never invented. */
	summary: z.string()
});
export type RunSummaryFinding = z.infer<typeof runSummaryFindingSchema>;

export const runSummarySchema = z.object({
	runId: z.string().uuid(),
	/** Every rule the engine consulted, and the ones that said no. */
	checks: z.number().int().nonnegative(),
	saves: z.number().int().nonnegative(),
	/** `guardrail.tripped` counts by guardrail id — the trip mix. */
	guardrailTrips: z.record(z.string(), z.number().int().nonnegative()),
	/** `approval.resolved` counts — how often a person was asked, and said yes. */
	approvalsRequested: z.number().int().nonnegative(),
	approvalsGranted: z.number().int().nonnegative(),
	findings: z.array(runSummaryFindingSchema),
	/** Decisions that proposed a call, and how many of those a hosted guard screened at `pre-act`. */
	decisions: z.number().int().nonnegative(),
	hostedPreActScreens: z.number().int().nonnegative(),
	/** Where the run was allowed to call (WP41, `26-…` §6.6) — `run.started.egress`, when the host named a mode. */
	egress: z.object({ mode: z.enum(['declared', 'none']), hosts: z.array(z.string()) }).optional(),
	schemaVersion: z.literal(1)
});
export type RunSummary = z.infer<typeof runSummarySchema>;

/**
 * **A campaign report, as the store keeps it** (WP38 stage D, `28-…` §4.9).
 *
 * The report's own schema lives with the runner in `@craftabot/evals`, which
 * `core` must not depend on — so the store keeps an *envelope*: the handful
 * of fields a list needs to show without opening the report, and the report
 * itself as opaque JSON that `@craftabot/evals`' `parseCampaignReport`
 * validates on the way back out. Small on purpose: a report carries metrics
 * and verdicts, never a trace.
 */
export const storedCampaignReportSchema = z.object({
	id: z.string().min(1),
	campaignId: z.string().min(1),
	title: z.string().min(1),
	createdAt: z.string().datetime(),
	passed: z.boolean(),
	gatesPassed: z.number().int().nonnegative(),
	gatesTotal: z.number().int().nonnegative(),
	cells: z.number().int().nonnegative(),
	report: z.record(z.string(), z.unknown()),
	schemaVersion: z.literal(1)
});
export type StoredCampaignReport = z.infer<typeof storedCampaignReportSchema>;

export function safeParseStoredCampaignReport(
	value: unknown
): ReturnType<typeof storedCampaignReportSchema.safeParse> {
	return storedCampaignReportSchema.safeParse(value);
}

export function safeParseRunSummary(value: unknown): ReturnType<typeof runSummarySchema.safeParse> {
	return runSummarySchema.safeParse(value);
}

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
