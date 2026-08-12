import { z } from 'zod';
import { agentSpecSchema } from './agent-spec.js';
import { engineEventSchema, type EngineEvent } from './events.js';

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
	specSnapshot: agentSpecSchema,
	packVersions: z.record(z.string(), z.string()),
	mode: z.enum(['step', 'play']),
	outcome: z.enum([
		'SUCCESS',
		'OUT_OF_STEPS',
		'STOPPED_BY_USER',
		'STOPPED_BY_GUARDRAIL',
		'ERROR',
		'IN_PROGRESS'
	]),
	ticks: z.number().int().nonnegative(),
	usage: z.object({
		inputTokens: z.number().int().nonnegative(),
		outputTokens: z.number().int().nonnegative()
	}),
	pinned: z.boolean(),
	startedAt: z.string().datetime(),
	finishedAt: z.string().datetime().optional(),
	schemaVersion: z.literal(1)
});
export type RunRecord = z.infer<typeof runRecordSchema>;

/** Trace export (07-DATA-MODEL-PERSISTENCE.md §5) — the governance artefact (08-GOVERNANCE-GUARDRAILS.md §4). */
export const traceFileSchema = z.object({
	format: z.literal('craftabot-trace'),
	formatVersion: z.literal(1),
	run: runRecordSchema,
	events: z.array(engineEventSchema),
	traceDigest: z.string().min(1)
});
export type TraceFile = z.infer<typeof traceFileSchema>;

export function parseTraceFile(value: unknown): TraceFile {
	return traceFileSchema.parse(value);
}

export function safeParseTraceFile(value: unknown): ReturnType<typeof traceFileSchema.safeParse> {
	return traceFileSchema.safeParse(value);
}

/** SHA-256 of the ordered event array — the integrity check (08-GOVERNANCE-GUARDRAILS.md §4). */
export async function computeTraceDigest(events: EngineEvent[]): Promise<string> {
	const data = new TextEncoder().encode(JSON.stringify(events));
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hashBuffer))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}
