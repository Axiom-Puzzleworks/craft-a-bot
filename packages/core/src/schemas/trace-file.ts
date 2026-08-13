import { z } from 'zod';
import { agentSpecSchema } from './agent-spec.js';
import { agentSpecV2Schema } from './agent-spec-v2.js';
import { engineEventSchema, type EngineEvent } from './events.js';
import { runOutcomeSchema, usageSchema, type MigrationError } from './shared.js';

/**
 * RunRecord (07-DATA-MODEL-PERSISTENCE.md §3) — first needed here for the
 * trace file's `run` field; WP4 (Persistence) reuses this same schema for
 * the `cab.runs` IndexedDB store.
 */
export const runRecordSchema = z.object({
	id: z.string().uuid(),
	agentId: z.string().uuid(),
	agentName: z.string().min(1),
	goalCardId: z.string().min(1),
	/**
	 * The bot exactly as it was when the run started.
	 *
	 * Either spec shape, and deliberately *not* a `formatVersion` bump: widening
	 * a field is additive, and the compatibility policy (`14-…` §7) only bumps on
	 * breaking shape changes. Every v2 trace ever written still parses; a trace
	 * written today carries v2 because that is what the workbench now stores.
	 *
	 * Narrowing this to v2 alone is slice 3's job, once nothing holds a v1 spec.
	 */
	specSnapshot: z.union([agentSpecSchema, agentSpecV2Schema]),
	packVersions: z.record(z.string(), z.string()),
	mode: z.enum(['step', 'play']),
	/**
	 * The run's outcome, plus the one state a *record* can be in that a run
	 * cannot: still going. A record is written the moment a run starts (so a
	 * reload does not lose it), and `IN_PROGRESS` is what that record says
	 * until the run ends — which is why this is `RunOutcome` widened rather
	 * than `RunOutcome` itself (E5, `14-…` §3).
	 */
	outcome: z.union([runOutcomeSchema, z.literal('IN_PROGRESS')]),
	ticks: z.number().int().nonnegative(),
	usage: usageSchema,
	/**
	 * The limits the run was actually held to (E8), which is not the same as
	 * the dial the builder set: the platform floor applies underneath it. An
	 * audit that cannot see the effective budget cannot tell a bot that ran out
	 * of turns from one that was never given enough.
	 */
	budgets: z.object({
		maxTicks: z.number().int().positive(),
		maxTokens: z.number().int().positive(),
		requestTimeoutMs: z.number().int().positive()
	}),
	/** Who answered, and with which model — not merely which cartridge was fitted. */
	providerId: z.string().min(1),
	wireModel: z.string().min(1),
	pinned: z.boolean(),
	startedAt: z.string().datetime(),
	finishedAt: z.string().datetime().optional(),
	schemaVersion: z.literal(2)
});
export type RunRecord = z.infer<typeof runRecordSchema>;

/**
 * Trace export (07-DATA-MODEL-PERSISTENCE.md §5) — the governance artefact
 * (08-GOVERNANCE-GUARDRAILS.md §4).
 *
 * > **Amended 2026-08-13 (WP13, E8):** `formatVersion` is **2**. v1 traces
 * > recorded neither the budgets a run was held to nor the model that actually
 * > answered, and their events carried no `agentId` (`12-…` D6, D9). Those are
 * > the questions an audit asks first, so the format that could not answer them
 * > had to change rather than be extended around.
 *
 * Kit files have had a migration table since WP4; traces, the *longer*-lived
 * artefact of the two, had none (`12-…` D7). They do now, and this is the
 * change that needed it.
 */
export const traceFileSchema = z.object({
	format: z.literal('craftabot-trace'),
	formatVersion: z.literal(2),
	run: runRecordSchema,
	events: z.array(engineEventSchema),
	traceDigest: z.string().min(1)
});
export type TraceFile = z.infer<typeof traceFileSchema>;

export const TRACE_FORMAT_VERSION = 2;

export function parseTraceFile(value: unknown): TraceFile {
	return traceFileSchema.parse(value);
}

export function safeParseTraceFile(value: unknown): ReturnType<typeof traceFileSchema.safeParse> {
	return traceFileSchema.safeParse(value);
}

/** The one migration-failure shape, shared with kit files, specs and records. */
export type TraceMigrationError = MigrationError;

type TraceMigration = (raw: Record<string, unknown>) => TraceFile | TraceMigrationError;

/** What a v1 trace could not tell you, filled in honestly rather than invented. */
const UNRECORDED = 'unrecorded';

/**
 * v1 → v2 (E8).
 *
 * Everything v2 adds is something v1 genuinely did not know, so the migration
 * cannot conjure it. It says `unrecorded` and means it: an old trace that
 * claimed a model or a budget it never captured would be worse than one that
 * admits the gap, because the whole point of the artefact is that you can
 * trust what it says.
 *
 * The one thing it *can* recover is `agentId`, because a v1 trace records the
 * agent on the run itself — so every event of a single-agent run belongs to
 * that agent by construction.
 */
function migrateV1ToV2(raw: Record<string, unknown>): TraceFile | TraceMigrationError {
	const run = raw['run'];
	if (typeof run !== 'object' || run === null) {
		return { kind: 'migration-error', message: 'trace file has no run record' };
	}
	const runRecord = run as Record<string, unknown>;
	const agentId = typeof runRecord['agentId'] === 'string' ? runRecord['agentId'] : undefined;

	const events = Array.isArray(raw['events']) ? raw['events'] : [];
	const upgraded = events.map((event) => {
		if (typeof event !== 'object' || event === null) return event;
		const record = event as Record<string, unknown>;
		const payload =
			typeof record['payload'] === 'object' && record['payload'] !== null
				? (record['payload'] as Record<string, unknown>)
				: {};

		// `run.started` gained the budgets and the model; `think.started`
		// swapped a cartridge id for the three ids it should always have had.
		const patched: Record<string, unknown> =
			record['type'] === 'run.started'
				? {
						...payload,
						budgets: payload['budgets'] ?? {
							maxTicks: 30,
							maxTokens: 100_000,
							requestTimeoutMs: 60_000
						},
						providerId: payload['providerId'] ?? UNRECORDED,
						wireModel: payload['wireModel'] ?? UNRECORDED,
						cartridgeId: payload['cartridgeId'] ?? UNRECORDED
					}
				: record['type'] === 'think.started'
					? {
							wireModel: payload['wireModel'] ?? UNRECORDED,
							providerId: payload['providerId'] ?? UNRECORDED,
							// v1's `model` was the cartridge id, mislabelled.
							cartridgeId: payload['cartridgeId'] ?? payload['model'] ?? UNRECORDED
						}
					: payload;

		return {
			...record,
			...(agentId !== undefined && record['agentId'] === undefined ? { agentId } : {}),
			payload: patched
		};
	});

	const candidate = {
		...raw,
		formatVersion: 2,
		run: {
			...runRecord,
			budgets: runRecord['budgets'] ?? {
				maxTicks: 30,
				maxTokens: 100_000,
				requestTimeoutMs: 60_000
			},
			providerId: runRecord['providerId'] ?? UNRECORDED,
			wireModel: runRecord['wireModel'] ?? UNRECORDED,
			schemaVersion: 2
		},
		events: upgraded
	};

	const result = traceFileSchema.safeParse(candidate);
	if (result.success) return result.data;
	return {
		kind: 'migration-error',
		message: `trace file failed v2 validation after migration: ${result.error.message}`
	};
}

/** Table-driven by `formatVersion`, exactly as kit files are (07 §6). */
const traceFileMigrations: Record<number, TraceMigration> = {
	1: migrateV1ToV2,
	2: (raw) => {
		const result = traceFileSchema.safeParse(raw);
		if (result.success) return result.data;
		return {
			kind: 'migration-error',
			message: `trace file failed v2 validation: ${result.error.message}`
		};
	}
};

export function migrateTraceFile(value: unknown): TraceFile | TraceMigrationError {
	if (typeof value !== 'object' || value === null) {
		return { kind: 'migration-error', message: 'trace file must be a JSON object' };
	}
	const raw = value as Record<string, unknown>;
	const version = raw['formatVersion'];
	const migration = typeof version === 'number' ? traceFileMigrations[version] : undefined;
	if (!migration) {
		const known = Object.keys(traceFileMigrations).map(Number);
		const newest = Math.max(...known);
		const message =
			typeof version === 'number' && version > newest
				? `This trace is from a newer set! It needs trace format v${version}, and this workbench understands v${newest}.`
				: 'This does not look like a trace file — it has no recognisable format version.';
		return { kind: 'migration-error', message, detectedVersion: version };
	}
	return migration(raw);
}

/** SHA-256 of the ordered event array — the integrity check (08-GOVERNANCE-GUARDRAILS.md §4). */
export async function computeTraceDigest(events: EngineEvent[]): Promise<string> {
	const data = new TextEncoder().encode(JSON.stringify(events));
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}
