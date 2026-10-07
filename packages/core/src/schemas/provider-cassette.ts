import { z } from 'zod';
import { egressDeclarationSchema } from '../types/guardrail-service.js';
import type { ChatRequest } from '../types/provider.js';
import { CASSETTE_FORMAT_VERSION, canonicalJson } from './cassette.js';
import { sha256Hex } from './sha256.js';
import { chatResponseSchema } from './shared.js';

/**
 * **A provider cassette** (WP114, `103-FALLIBLE-ACTORS.md` §3; `100-…` §6.1,
 * D14): the cassette file (`47-…` §4.2) over *provider* calls rather than a
 * service line's — `kind: 'provider'` beside the line cassette's shape. One
 * entry per call the recording made, keyed by the digest of the composed
 * prompt (the model, the messages, the tools, the temperature, the token
 * cap) and, for a prompt asked more than once, its occurrence; holding the
 * response exactly as the provider returned it, its usage and its latency.
 * Replayed by `createCassetteProvider`, a prompt it has not seen is a loud
 * `cassette-miss` and is never sent. Every entry pins the model id.
 */
export const providerCassetteEntrySchema = z.object({
	/** SHA-256 over the canonical JSON of the request (`promptDigest`). */
	promptDigest: z.string().regex(/^[0-9a-f]{64}$/),
	/** The how-many-th time this prompt was asked in the recording, from 0: a replay answers each in turn. */
	occurrence: z.number().int().nonnegative(),
	/** The provider-native model id that answered — pinned, so a cassette never stands in for another model. */
	model: z.string().min(1),
	response: chatResponseSchema,
	latencyMs: z.number().nonnegative()
});
export type ProviderCassetteEntry = z.infer<typeof providerCassetteEntrySchema>;

export const providerCassetteFileSchema = z.object({
	format: z.literal('craftabot-cassette'),
	formatVersion: z.literal(CASSETTE_FORMAT_VERSION),
	kind: z.literal('provider'),
	/** The provider the recording called — the replay presents the same id, so its trace is the recording's. */
	providerId: z.string().min(1),
	recordedAt: z.string().datetime(),
	recordedBy: z.string().min(1),
	/** What was recorded, in words: the experiment, the size, the seeds — or that it was the mock provider. */
	note: z.string().optional(),
	/** The egress the recording ran under — the provider's own declarations at the time. */
	egress: z.array(egressDeclarationSchema),
	entries: z.array(providerCassetteEntrySchema)
});
export type ProviderCassetteFile = z.infer<typeof providerCassetteFileSchema>;

export function parseProviderCassette(value: unknown): ProviderCassetteFile {
	return providerCassetteFileSchema.parse(value);
}

/**
 * The digest a provider cassette keys by: SHA-256 over the canonical JSON of
 * what reaches the provider — model, messages, tools, temperature, token cap.
 * Synchronous (`sha256Hex`), so the Worker and the harness key the same way.
 */
export function promptDigest(request: ChatRequest): string {
	return sha256Hex(
		canonicalJson({
			model: request.model,
			messages: request.messages,
			tools: request.tools ?? [],
			temperature: request.temperature,
			maxTokens: request.maxTokens,
			// WP120: a constrained or log-probability request is another prompt; absent, every earlier digest is unchanged.
			...(request.choice ? { choice: request.choice } : {}),
			...(request.topLogprobs !== undefined ? { topLogprobs: request.topLogprobs } : {})
		})
	);
}

// ── The recording, format version 2 (WP189, `113-RECORDING-AND-RELIABILITY.md` §4.1) ──────────────

/** The version a cell-scoped recording carries. Version 1 is the merged, prompt-keyed cassette above. */
export const RECORDING_FORMAT_VERSION = 2;

/**
 * **One call the live run made** (`113-…` §4.2): in the order the cell made
 * it, with the session it belonged to (`role` and the stage's `stage`, and
 * which time that stage's provider was made, `segment`), the digest of what
 * was asked, and what came back — the response *or* the error, with the unit
 * that answered when the provider said. A failed call is kept: the first
 * recording lost every one.
 */
export const recordedCallSchema = z
	.object({
		seq: z.number().int().nonnegative(),
		role: z.enum(['agent', 'seat']),
		stage: z.string(),
		segment: z.number().int().nonnegative(),
		promptDigest: z.string().regex(/^[0-9a-f]{64}$/),
		model: z.string().min(1),
		latencyMs: z.number().nonnegative(),
		/** Which serving unit answered, when the provider reported one (the Spark transport does). */
		unit: z.string().optional(),
		response: chatResponseSchema.optional(),
		error: z
			.object({
				kind: z.string(),
				message: z.string(),
				retryAfterMs: z.number().nonnegative().optional()
			})
			.optional()
	})
	.refine((call) => (call.response === undefined) !== (call.error === undefined), {
		message: 'a recorded call holds a response or an error, never both and never neither'
	});
export type RecordedCall = z.infer<typeof recordedCallSchema>;

/** One performance of a cell: its inputs' identity, how it ended, the digest of its path and every call it made. */
export const recordedCellSchema = z.object({
	cellKey: z.string().min(1),
	trial: z.number().int().nonnegative(),
	/** The live run's own id — the key into the (gitignored) store the live run wrote. */
	runId: z.string().optional(),
	/** Every agent run a journey cell made, in order, and the workflow run that held them — the keys into the live store, so the recording can be checked against it (WP190). */
	runIds: z.array(z.string()).optional(),
	workflowRunId: z.string().optional(),
	outcome: z.string().optional(),
	/** `pathDigest` (WP190): over the decision-relevant events, so a replay is held to the path the live run took. */
	pathDigest: z
		.string()
		.regex(/^[0-9a-f]{64}$/)
		.optional(),
	calls: z.array(recordedCallSchema)
});
export type RecordedCell = z.infer<typeof recordedCellSchema>;

export const recordingManifestSchema = z.object({
	experimentId: z.string().optional(),
	/** SHA-256 of each expanded campaign file as run, by campaign id: what `reperform` checks before it reruns. */
	campaignDigests: z.record(z.string(), z.string()),
	packVersions: z.record(z.string(), z.string()),
	/** Every (temperature, token cap) the requests carried. */
	sampling: z.array(
		z.object({ temperature: z.number().optional(), maxTokens: z.number().optional() })
	),
	models: z.array(z.string()),
	/** The serving units that answered, when the provider said. */
	units: z.array(z.string()),
	trials: z.number().int().positive(),
	/** The ways the recorder changed a run: only the credential stop, and only when it fired (`113-…` D7). */
	interventions: z.array(z.string())
});
export type RecordingManifest = z.infer<typeof recordingManifestSchema>;

export const providerRecordingFileSchema = z.object({
	format: z.literal('craftabot-cassette'),
	formatVersion: z.literal(RECORDING_FORMAT_VERSION),
	kind: z.literal('provider-recording'),
	providerId: z.string().min(1),
	recordedAt: z.string().datetime(),
	recordedBy: z.string().min(1),
	note: z.string().optional(),
	egress: z.array(egressDeclarationSchema),
	manifest: recordingManifestSchema,
	cells: z.array(recordedCellSchema)
});
export type ProviderRecordingFile = z.infer<typeof providerRecordingFileSchema>;

export function parseProviderRecording(value: unknown): ProviderRecordingFile {
	return providerRecordingFileSchema.parse(value);
}

/** A provider cassette of either version, told apart by its `kind`. */
export type AnyProviderCassette =
	{ version: 1; file: ProviderCassetteFile } | { version: 2; file: ProviderRecordingFile };

export function parseAnyProviderCassette(value: unknown): AnyProviderCassette {
	const kind = (value as { kind?: unknown } | null)?.kind;
	return kind === 'provider-recording'
		? { version: 2, file: parseProviderRecording(value) }
		: { version: 1, file: parseProviderCassette(value) };
}

/**
 * **The identity of a cell's inputs** (`113-…` §4.3): campaign, scenario,
 * build, guard, brain, context, item, seed and trial — not its position, so a
 * re-ordering or a chunking cannot move it. The join between a recording, a
 * replay and a `reperform`.
 */
export function cellKeyOf(parts: {
	campaignId: string;
	scenario: string;
	build: string;
	guard: string;
	brain: string;
	context?: string | undefined;
	item?: string | undefined;
	seed: number;
	trial?: number | undefined;
}): string {
	return [
		parts.campaignId,
		parts.scenario,
		parts.build,
		parts.guard,
		parts.brain,
		parts.context ?? '',
		parts.item ?? '',
		String(parts.seed),
		String(parts.trial ?? 0)
	].join('|');
}
