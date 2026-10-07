import {
	promptDigest,
	type ProviderCassetteEntry,
	type ProviderCassetteFile,
	type RecordedCall
} from './schemas/provider-cassette.js';
import type { ChatResponse } from './schemas/shared.js';
import type { KeyCheck, LLMProvider } from './types/provider.js';

/** The error a replay throws for a prompt the cassette has not seen: the session writes it as `error` with this kind. */
export const PROVIDER_CASSETTE_MISS = 'cassette-miss';

export class ProviderCassetteMiss extends Error {
	readonly kind = PROVIDER_CASSETTE_MISS;
	constructor(
		readonly digest: string,
		readonly occurrence: number
	) {
		super(
			`cassette-miss: the provider cassette holds no answer for prompt ${digest.slice(0, 12)}… (occurrence ${occurrence}); nothing was sent`
		);
	}
}

/**
 * **A provider that replays a cassette** (WP114, `103-FALLIBLE-ACTORS.md` §3):
 * presents the recorded provider's id, answers each prompt with what the
 * provider said to it in the recording — the n-th asking of a prompt with
 * the n-th answer — and never calls out: it has no `fetch` and declares no
 * egress. A prompt it has not seen throws `ProviderCassetteMiss`, which the
 * session writes as an `error` of kind `cassette-miss`. Streaming replays the
 * recorded text in the mock provider's chunks, so `think.token` events stay
 * as a scripted run's are.
 */
export function createCassetteProvider(cassette: ProviderCassetteFile): LLMProvider {
	const byDigest = new Map<string, ProviderCassetteEntry[]>();
	for (const entry of cassette.entries) {
		const list = byDigest.get(entry.promptDigest) ?? [];
		list[entry.occurrence] = entry;
		byDigest.set(entry.promptDigest, list);
	}
	const asked = new Map<string, number>();
	return {
		id: cassette.providerId,
		name: `${cassette.providerId} (recorded)`,
		keyRequirement: 'none',
		egress: [],
		validateKey(): Promise<KeyCheck> {
			return Promise.resolve({ ok: true, message: 'A recording needs no battery.' });
		},
		async chat(request, opts): Promise<ChatResponse> {
			const digest = promptDigest(request);
			const occurrence = asked.get(digest) ?? 0;
			asked.set(digest, occurrence + 1);
			const entry = byDigest.get(digest)?.[occurrence];
			if (!entry || entry.model !== request.model)
				throw new ProviderCassetteMiss(digest, occurrence);
			const response = structuredClone(entry.response);
			if (opts.onToken && response.text !== '') {
				for (const chunk of response.text.split(/(?<=\s)/)) {
					if (opts.signal.aborted) break;
					opts.onToken(chunk);
				}
			}
			if (opts.signal.aborted) throw new Error('The request was aborted.');
			return response;
		}
	};
}

/** What `recordingProvider` collects: the entries, in the order the calls were made. */
export interface ProviderRecording {
	provider: LLMProvider;
	entries: ProviderCassetteEntry[];
}

/** What the tap tells its listener about one call, a failed one too (WP189). */
export interface TappedCall {
	promptDigest: string;
	model: string;
	latencyMs: number;
	/** The serving unit that answered, when the provider reported one. */
	unit?: string;
	temperature?: number;
	maxTokens?: number;
	/** The response as written: `raw` dropped when the recording is slim. */
	response?: ChatResponse;
	error?: { kind: string; message: string; retryAfterMs?: number };
}

/**
 * **A provider that records** (WP114, made a passive tap by WP189,
 * `113-RECORDING-AND-RELIABILITY.md` §3): passes every call through to `inner`
 * and keeps an entry per call — the prompt's digest and its occurrence
 * *within this provider*, the model, the response and the latency by `now`.
 * The session sees what the provider returned (a recorder given a clock adds
 * the call's `latencyMs`, as `timedProvider` does for any live call, so a
 * replay agrees on `think.completed.durationMs`); `slim` drops the raw wire
 * chunks from what is *written* only. `onCall` is told every call — a failed
 * one too, with the serving unit when the provider reports it — and the error
 * is rethrown unchanged. A recording over many cells merges with
 * `mergeProviderEntries`.
 */
export function recordingProvider(
	inner: LLMProvider,
	options: { now?: () => number; slim?: boolean; onCall?: (call: TappedCall) => void } = {}
): ProviderRecording {
	const now = options.now ?? (() => 0);
	const seen = new Map<string, number>();
	const entries: ProviderCassetteEntry[] = [];
	const provider: LLMProvider = {
		...inner,
		validateKey: (key) => inner.validateKey(key),
		async chat(request, opts) {
			const started = now();
			const digest = promptDigest(request);
			let unit: string | undefined;
			const told = {
				promptDigest: digest,
				model: request.model,
				...(request.temperature !== undefined ? { temperature: request.temperature } : {}),
				...(request.maxTokens !== undefined ? { maxTokens: request.maxTokens } : {})
			};
			let answered: ChatResponse;
			try {
				answered = await inner.chat(request, {
					...opts,
					onServed: (served) => {
						unit = served;
						opts.onServed?.(served);
					}
				});
			} catch (error) {
				options.onCall?.({
					...told,
					latencyMs: Math.max(0, now() - started),
					...(unit !== undefined ? { unit } : {}),
					error: describeError(error)
				});
				throw error;
			}
			const latencyMs = Math.max(0, now() - started);
			// A recorder given a clock timed the call: the response carries it (WP160), so the recording's trace and a replay's agree on `think.completed.durationMs`.
			const response: ChatResponse = options.now ? { ...answered, latencyMs } : answered;
			// Slim (WP168): the wire's stream chunks are about nine tenths of a live entry and nothing replays them. Dropped from the
			// entry written, never from what the session saw (WP189: the tap is passive).
			const written: ChatResponse = options.slim ? { ...response, raw: null } : response;
			const occurrence = seen.get(digest) ?? 0;
			seen.set(digest, occurrence + 1);
			entries.push({
				promptDigest: digest,
				occurrence,
				model: request.model,
				response: structuredClone(written),
				latencyMs
			});
			options.onCall?.({
				...told,
				latencyMs,
				...(unit !== undefined ? { unit } : {}),
				response: structuredClone(written)
			});
			return response;
		}
	};
	return { provider, entries };
}

/** An error as the recording keeps it: its kind (a provider error's own, else its name), its message and any retry hint. */
export function describeError(error: unknown): NonNullable<TappedCall['error']> {
	const held =
		error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : {};
	const retryAfter = held['retryAfterMs'];
	return {
		kind:
			typeof held['kind'] === 'string'
				? held['kind']
				: error instanceof Error
					? error.name
					: 'unknown',
		message: error instanceof Error ? error.message : String(error),
		...(typeof retryAfter === 'number' && retryAfter >= 0 ? { retryAfterMs: retryAfter } : {})
	};
}

/**
 * **One cell's tape** (WP189, `113-…` §4.2): the calls a cell made, in the
 * order it made them, across every session the cell ran — each stage's agent
 * and the seated visitor. `open(role, stage)` is called as each session's
 * provider is made and counts which time that stage's provider this is; the
 * sink it returns is the tap's `onCall`.
 */
export interface CellTape {
	readonly cellKey: string;
	readonly trial: number;
	readonly calls: RecordedCall[];
	meta: {
		runId?: string;
		runIds?: string[];
		workflowRunId?: string;
		outcome?: string;
		pathDigest?: string;
	};
	open(role: 'agent' | 'seat', stage: string): (call: TappedCall) => void;
}

/** Every cell's tape in a recording, by the cell's key. */
export class RecordingTape {
	readonly cells = new Map<string, CellTape>();

	cell(cellKey: string, trial: number): CellTape {
		const held = this.cells.get(cellKey);
		if (held) return held;
		const calls: RecordedCall[] = [];
		const segments = new Map<string, number>();
		const tape: CellTape = {
			cellKey,
			trial,
			calls,
			meta: {},
			open(role, stage) {
				const key = `${role}|${stage}`;
				const segment = segments.get(key) ?? 0;
				segments.set(key, segment + 1);
				return (call) => {
					calls.push({
						seq: calls.length,
						role,
						stage,
						segment,
						promptDigest: call.promptDigest,
						model: call.model,
						latencyMs: call.latencyMs,
						...(call.unit !== undefined ? { unit: call.unit } : {}),
						...(call.response !== undefined ? { response: call.response } : {}),
						...(call.error !== undefined ? { error: call.error } : {})
					});
				};
			}
		};
		this.cells.set(cellKey, tape);
		return tape;
	}
}

/**
 * **A provider that times its calls** (WP160, `112-REAL-ENOUGH-PLAN.md` §5):
 * passes every call through and puts how long it took on the response as
 * `latencyMs`, which the session writes as `think.completed.durationMs`. A
 * live host wraps its provider in this; a scripted or mock one never is, so
 * its traces stay byte for byte. `now` is a monotonic millisecond clock
 * (`performance.now` by default).
 */
export function timedProvider(
	inner: LLMProvider,
	now: () => number = () => performance.now()
): LLMProvider {
	return {
		...inner,
		validateKey: (key) => inner.validateKey(key),
		async chat(request, opts) {
			const started = now();
			const response = await inner.chat(request, opts);
			return { ...response, latencyMs: Math.max(0, Math.round(now() - started)) };
		}
	};
}

/**
 * Many cells' recordings as one cassette's entries: the first answer to each
 * (prompt, occurrence) is kept, in the order met. Two cells that asked the
 * same prompt the same number of times are the same conversation so far; a
 * provider that answered them differently is recorded as it first did, and
 * `conflicts` says how often that happened so the recorder can say so.
 */
export function mergeProviderEntries(recordings: ReadonlyArray<readonly ProviderCassetteEntry[]>): {
	entries: ProviderCassetteEntry[];
	conflicts: number;
} {
	const kept = new Map<string, ProviderCassetteEntry>();
	let conflicts = 0;
	for (const recording of recordings) {
		for (const entry of recording) {
			const key = `${entry.promptDigest}#${entry.occurrence}`;
			const first = kept.get(key);
			if (!first) kept.set(key, entry);
			else if (JSON.stringify(first.response) !== JSON.stringify(entry.response)) conflicts += 1;
		}
	}
	return { entries: [...kept.values()], conflicts };
}
