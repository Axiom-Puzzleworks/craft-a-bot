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
