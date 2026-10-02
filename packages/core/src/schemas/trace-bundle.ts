import { z } from 'zod';
import { evaluationRecordSchema } from './evaluation.js';
import { engineEventSchema } from './events.js';
import { groupRunRecordSchema } from './records.js';
import { computeTraceDigest, replayedFromSchema, traceFileSchema } from './trace-file.js';

/**
 * **The trace bundle** (`36-BUNDLE-AND-GROUPS.md` §4.1, WP48; `26-…` §6.7):
 * every member trace as the `TraceFile` a reader already knows, the group's
 * merged stream with its own digest, the evaluations, and one digest over
 * every digest inside — so a changed byte anywhere in the bundle fails
 * verification, and a solo run's bundle is its trace file plus a wrapper.
 */

export const BUNDLE_FORMAT_VERSION = 1;

export const traceBundleSchema = z.object({
	format: z.literal('craftabot-bundle'),
	formatVersion: z.literal(BUNDLE_FORMAT_VERSION),
	exportedAt: z.string().datetime(),
	exportedBy: z.string().min(1),
	runs: z.array(traceFileSchema).min(1),
	group: z
		.object({
			record: groupRunRecordSchema,
			events: z.array(engineEventSchema),
			groupDigest: z.string().min(1)
		})
		.optional(),
	evaluations: z.array(evaluationRecordSchema).default([]),
	campaign: z.object({ id: z.string().min(1), cellId: z.string().min(1) }).optional(),
	/**
	 * Replayed from a provider cassette (WP160, D13): beside the digest, never in
	 * a trace. It is folded into the bundle digest when present, so it cannot be
	 * added or stripped unnoticed; a bundle without it digests as it always did.
	 */
	replayedFrom: replayedFromSchema.optional(),
	bundleDigest: z.string().min(1)
});
export type TraceBundle = z.infer<typeof traceBundleSchema>;

export function parseTraceBundle(value: unknown): TraceBundle {
	return traceBundleSchema.parse(value);
}

/** The digest over the digests: every member's, the group's (or null), every evaluation's id — in order. */
export async function computeBundleDigest(parts: {
	runDigests: readonly string[];
	groupDigest?: string | undefined;
	evaluationIds: readonly string[];
	replayedFrom?: z.infer<typeof replayedFromSchema> | undefined;
}): Promise<string> {
	const data = new TextEncoder().encode(
		JSON.stringify([
			...parts.runDigests,
			parts.groupDigest ?? null,
			...parts.evaluationIds,
			// Only when replayed: every bundle written before keeps its digest.
			...(parts.replayedFrom
				? [
						{
							replayedFrom: [
								parts.replayedFrom.cassette,
								parts.replayedFrom.model,
								parts.replayedFrom.recorded
							]
						}
					]
				: [])
		])
	);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

export { computeTraceDigest };
