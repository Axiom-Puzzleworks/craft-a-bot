import { z } from 'zod';
import { agentSpecSchema } from './agent-spec.js';
import { buildProblemSchema } from './build-problem.js';
import { engineEventSchema } from './events.js';

/**
 * The stored entities (07-DATA-MODEL-PERSISTENCE.md §3). Every one carries a
 * UUID `id`, ISO timestamps, and a `schemaVersion` so a future Supabase sync is
 * additive rather than schema surgery (§1.2). `RunRecord` already lives in
 * trace-file.ts, where the trace export needs it.
 */

/** A shelf item — the spec plus the metadata the box art and build checks need. */
export const agentRecordSchema = z.object({
	id: z.string().uuid(), // same as spec.id
	spec: agentSpecSchema,
	/** Deterministic seed for the generated box-art variation (03-UI-UX-DESIGN.md §3). */
	boxArtSeed: z.string(),
	lastValidation: z.array(buildProblemSchema),
	lastRunId: z.string().uuid().optional(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
	schemaVersion: z.literal(1)
});
export type AgentRecord = z.infer<typeof agentRecordSchema>;

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
