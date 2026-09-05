import { z } from 'zod';
import { egressDeclarationSchema } from '../types/guardrail-service.js';
import type { ToolResult } from '../types/tool.js';

/**
 * **A cassette** (WP58, `47-SERVICE-LINES.md` §4.2; `41-…` §6.4): one
 * service line's recording of a real sandbox — every call the recording
 * script made, its arguments and their digest, the result, the latency —
 * written by `craftabot record` under declared egress and redacted against
 * every secret the recording process held. Replayed by `op + argsDigest`;
 * a miss is a failed call, never a call out. A pack ships one under
 * `src/cassettes/`, so the synthetic sweep and the key-leak test read it.
 */
export const CASSETTE_FORMAT_VERSION = 1;

const toolResultSchema = z.object({
	ok: z.boolean(),
	output: z.string(),
	data: z.unknown().optional(),
	errorKind: z.string().optional()
});

export const cassetteEntrySchema = z.object({
	op: z.string().min(1),
	/** SHA-256 over the canonical JSON of `args` — what a replay resolves by. */
	argsDigest: z.string().min(1),
	args: z.unknown(),
	result: toolResultSchema,
	latencyMs: z.number().nonnegative()
});
export type CassetteEntry = z.infer<typeof cassetteEntrySchema>;

export const cassetteFileSchema = z.object({
	format: z.literal('craftabot-cassette'),
	formatVersion: z.literal(CASSETTE_FORMAT_VERSION),
	lineId: z.string().min(1),
	recordedAt: z.string().datetime(),
	recordedBy: z.string().min(1),
	/** The egress the recording ran under — the line's own declarations at the time. */
	egress: z.array(egressDeclarationSchema),
	entries: z.array(cassetteEntrySchema)
});
export type CassetteFile = z.infer<typeof cassetteFileSchema>;

export function parseCassetteFile(value: unknown): CassetteFile {
	return cassetteFileSchema.parse(value);
}

/** JSON with every object's keys sorted, so two spellings of the same arguments digest the same. */
export function canonicalJson(value: unknown): string {
	return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.keys(value as Record<string, unknown>)
				.sort()
				.map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
		);
	}
	return value;
}

/** SHA-256 of the canonical JSON of the arguments, through `crypto.subtle` like the trace digest. */
export async function argsDigest(args: unknown): Promise<string> {
	const data = new TextEncoder().encode(canonicalJson(args ?? {}));
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
}

/** The recorded result for `op` with these arguments, or `undefined` — a miss. A clone each time. */
export async function replayFromCassette(
	cassette: CassetteFile,
	op: string,
	args: unknown
): Promise<ToolResult | undefined> {
	const digest = await argsDigest(args);
	const entry = cassette.entries.find(
		(candidate) => candidate.op === op && candidate.argsDigest === digest
	);
	return entry ? (structuredClone(entry.result) as ToolResult) : undefined;
}
