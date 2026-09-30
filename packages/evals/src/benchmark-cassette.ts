import { canonicalJson, sha256Hex } from '@craftabot/core';
import { z } from 'zod';

/**
 * **A benchmark cassette** (WP123, `106-BENCHMARK.md` §6): a subject's HTTP
 * answers, recorded under its own client so a replay parses them the way a
 * live run does. Keyed by method, URL and body — never a header, so no key is
 * ever written — with the latency each call took when it was recorded. A
 * replay needs no key and no network; a request it has no entry for is a
 * miss, which the service's client reports as an error and the benchmark
 * counts, never flags.
 */
export const BENCHMARK_CASSETTE_KIND = 'craftabot-benchmark-cassette';

export const benchmarkCassetteSchema = z.object({
	kind: z.literal(BENCHMARK_CASSETTE_KIND),
	version: z.literal(1),
	subjectId: z.string().min(1),
	/** When, as the recorder stamped it. */
	recordedAt: z.string().min(1),
	entries: z.array(
		z.object({
			key: z.string().regex(/^[0-9a-f]{64}$/),
			status: z.number().int(),
			body: z.string(),
			latencyMs: z.number().min(0)
		})
	)
});
export type BenchmarkCassette = z.infer<typeof benchmarkCassetteSchema>;

type FetchInput = Parameters<typeof globalThis.fetch>[0];
type FetchInit = Parameters<typeof globalThis.fetch>[1];

function urlOf(input: FetchInput): string {
	if (typeof input === 'string') return input;
	if (input instanceof URL) return input.href;
	return input.url;
}

/** The request's key: SHA-256 over method, URL and body — headers, and so any credential, left out. */
export function benchmarkRequestKey(input: FetchInput, init?: FetchInit): string {
	const body =
		typeof init?.body === 'string' ? init.body : init?.body == null ? '' : String(init.body);
	return sha256Hex(
		canonicalJson({ method: (init?.method ?? 'GET').toUpperCase(), url: urlOf(input), body })
	);
}

/** Wraps a live fetch and keeps each answer; `now` is the recorder's clock, milliseconds. */
export function recordingFetch(
	live: typeof globalThis.fetch,
	now: () => number
): { fetch: typeof globalThis.fetch; entries(): BenchmarkCassette['entries'] } {
	const entries = new Map<string, BenchmarkCassette['entries'][number]>();
	const fetch = (async (input: FetchInput, init?: FetchInit) => {
		const key = benchmarkRequestKey(input, init);
		const started = now();
		const response = await live(input, init);
		const body = await response.text();
		entries.set(key, {
			key,
			status: response.status,
			body,
			latencyMs: Math.max(0, now() - started)
		});
		return new Response(body, { status: response.status });
	}) as typeof globalThis.fetch;
	return { fetch, entries: () => [...entries.values()].sort((a, b) => a.key.localeCompare(b.key)) };
}

/** Replays a cassette: its answers, the latencies they were recorded with, and a count of misses. */
export function cassetteFetch(cassette: BenchmarkCassette): {
	fetch: typeof globalThis.fetch;
	latencies(): number[];
	misses(): number;
} {
	const byKey = new Map(cassette.entries.map((entry) => [entry.key, entry]));
	const latencies: number[] = [];
	let misses = 0;
	const fetch = ((input: FetchInput, init?: FetchInit) => {
		const entry = byKey.get(benchmarkRequestKey(input, init));
		if (!entry) {
			misses += 1;
			return Promise.reject(
				new Error(`cassette-miss: ${cassette.subjectId} has no answer for this request`)
			);
		}
		latencies.push(entry.latencyMs);
		return Promise.resolve(new Response(entry.body, { status: entry.status }));
	}) as typeof globalThis.fetch;
	return { fetch, latencies: () => [...latencies], misses: () => misses };
}
