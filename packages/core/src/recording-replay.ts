import { canonicalJson } from './schemas/cassette.js';
import { engineEventSchema, type EngineEvent } from './schemas/events.js';
import {
	promptDigest,
	type ProviderRecordingFile,
	type RecordedCall,
	type RecordedCell
} from './schemas/provider-cassette.js';
import { sha256Hex } from './schemas/sha256.js';
import type { ChatRequest, LLMProvider } from './types/provider.js';

/**
 * **Exact replay of a cell-scoped recording** (WP190,
 * `113-RECORDING-AND-RELIABILITY.md` §4.4–§4.5). A replay *verifies*: it is
 * handed one cell's calls and answers them in the order they were made,
 * checking each prompt's digest. It never looks a prompt up in another cell's
 * answers and never substitutes: a different prompt at any call is a
 * `replay-diverged` error carrying what was asked and what the recording
 * holds, so a code change that moves a prompt is a finding, not a model error.
 */
export const REPLAY_DIVERGED = 'replay-diverged';

export class ReplayDiverged extends Error {
	readonly kind = REPLAY_DIVERGED;
	constructor(
		readonly cellKey: string,
		/** The recorded call's position in the cell, or -1 when the replay asked for more calls than the recording holds. */
		readonly seq: number,
		readonly expected: string | undefined,
		readonly got: string,
		readonly asked: ChatRequest,
		why: string
	) {
		const last = asked.messages.at(-1)?.content ?? '';
		super(
			`replay-diverged: cell ${cellKey}, call #${seq} — ${why}; asked prompt ${got.slice(0, 12)}…${expected ? `, the recording holds ${expected.slice(0, 12)}…` : ''}. The last message asked: “${last.slice(0, 240).replace(/\s+/g, ' ')}”`
		);
		this.name = 'ReplayDiverged';
	}
}

/** A call that failed when it was recorded, failing again as it did: the session's own retry and error path runs as it ran. */
export class RecordedProviderError extends Error {
	readonly kind: string;
	readonly retryAfterMs?: number;
	constructor(error: NonNullable<RecordedCall['error']>) {
		super(error.message);
		this.name = 'RecordedProviderError';
		this.kind = error.kind;
		if (error.retryAfterMs !== undefined) this.retryAfterMs = error.retryAfterMs;
	}
}

/** What a cell's replay did: how many recorded calls it answered, how many were left, and where it diverged if it did. */
export interface CellReplayReport {
	cellKey: string;
	total: number;
	consumed: number;
	unused: number;
	diverged?: { seq: number; expected?: string; got: string; why: string };
}

export interface CellReplay {
	readonly cell: RecordedCell;
	/** The provider for the next session of this role and stage, in the order the recording made them. */
	providerFor(role: 'agent' | 'seat', stage: string): LLMProvider;
	report(): CellReplayReport;
}

export interface RecordingReplay {
	readonly file: ProviderRecordingFile;
	has(cellKey: string): boolean;
	/** A fresh replay of one cell: cursors at the start, so a cell can be replayed again. */
	forCell(cellKey: string): CellReplay;
}

export function createRecordingReplay(file: ProviderRecordingFile): RecordingReplay {
	const byKey = new Map(file.cells.map((cell) => [cell.cellKey, cell]));
	return {
		file,
		has: (cellKey) => byKey.has(cellKey),
		forCell(cellKey) {
			const cell = byKey.get(cellKey);
			if (!cell) throw new Error(`the recording holds no cell "${cellKey}"`);
			const segments = new Map<string, RecordedCall[]>();
			for (const call of cell.calls) {
				const key = `${call.role}|${call.stage}|${call.segment}`;
				segments.set(key, [...(segments.get(key) ?? []), call]);
			}
			const made = new Map<string, number>();
			let consumed = 0;
			let diverged: CellReplayReport['diverged'];
			return {
				cell,
				providerFor(role, stage) {
					const sessionKey = `${role}|${stage}`;
					const segment = made.get(sessionKey) ?? 0;
					made.set(sessionKey, segment + 1);
					const calls = segments.get(`${sessionKey}|${segment}`) ?? [];
					let cursor = 0;
					const fail = (
						seq: number,
						expected: string | undefined,
						request: ChatRequest,
						digest: string,
						why: string
					): never => {
						diverged ??= { seq, ...(expected ? { expected } : {}), got: digest, why };
						throw new ReplayDiverged(cellKey, seq, expected, digest, request, why);
					};
					return {
						id: file.providerId,
						name: `${file.providerId} (recorded)`,
						keyRequirement: 'none',
						egress: [],
						validateKey: () =>
							Promise.resolve({ ok: true, message: 'A recording needs no battery.' }),
						async chat(request, opts) {
							const digest = promptDigest(request);
							const next = calls[cursor];
							if (!next)
								return fail(
									-1,
									undefined,
									request,
									digest,
									`the ${role} session for ${stage} asked more calls than the recording made`
								);
							if (next.promptDigest !== digest)
								return fail(
									next.seq,
									next.promptDigest,
									request,
									digest,
									`the ${role} session for ${stage} asked a different prompt from the one recorded`
								);
							if (next.model !== request.model)
								return fail(
									next.seq,
									next.promptDigest,
									request,
									digest,
									`the recording was answered by ${next.model}, not ${request.model}`
								);
							cursor += 1;
							consumed += 1;
							if (next.error) throw new RecordedProviderError(next.error);
							const response = structuredClone(next.response!);
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
				},
				report: () => ({
					cellKey,
					total: cell.calls.length,
					consumed,
					unused: cell.calls.length - consumed,
					...(diverged ? { diverged } : {})
				})
			};
		}
	};
}

// ── The path digest (`113-…` §4.4) ───────────────────────────────────────────

/** The events that carry a cell's decisions: what it was asked, what it decided and did, what the guards and the people said, how it ended. */
const PATH_EVENTS = new Set([
	'prompt.composed',
	'decision',
	'action.performed',
	'guardrail.checked',
	'guardrail.tripped',
	'approval.requested',
	'approval.resolved',
	'seat.said',
	'stage.started',
	'stage.completed',
	'stage.overdue',
	'reader.answered',
	'reviewer.drew',
	'disclosure.given',
	'provider.retried',
	'error',
	'run.finished'
]);
/**
 * A guard that looked and let it through, changing nothing. Not a decision: a guard that blocks is a `guardrail.tripped`, and one that
 * redacts, annotates or marks says so in its verdict and stays. Whether a plain allow is *recorded* depends on who is named on the run
 * (a principal's attestation asks the chain a second time), so the same decisions would otherwise digest two ways — found when the
 * first full live recording replayed as `mismatch` under the CLI and as `match` under `recording verify` (`113-…` §11, WP195).
 */
function isPlainAllow(event: EngineEvent): boolean {
	if (event.type !== 'guardrail.checked') return false;
	const verdict = event.payload.verdict as Record<string, unknown>;
	return (
		verdict['allow'] === true &&
		verdict['verdictKind'] === undefined &&
		verdict['redactedText'] === undefined &&
		verdict['mark'] === undefined
	);
}
/** Wall-clock and wire detail: left out, so a replay (which has no wall clock) can reproduce the digest. */
const OFF_PATH = new Set(['durationMs', 'latencyMs', 'timestamp', 'raw', 'attestation']);
/**
 * Identity, not path: ids are allocated by a counter that every event advances, and a live provider streams in its own
 * chunks while a replay splits the recorded text on whitespace, so the same decisions leave different numbers of
 * `think.token` events and the ids after them differ. A journey's stage records name the agent runs by id.
 */
const IDENTITY = new Set(['runId', 'runIds', 'eventId', 'workflowRunId']);

function onPath(value: unknown, off: ReadonlySet<string> = OFF_PATH): unknown {
	if (Array.isArray(value)) return value.map((held) => onPath(held, off));
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([key]) => !off.has(key))
				.map(([key, held]) => [key, onPath(held, off)])
		);
	}
	return value;
}

/**
 * **The digest of the path a cell took** (WP190): over each run's
 * decision-relevant events in order, and — for a journey — the workflow's own
 * events and the digest of its stages, with the wall-clock fields left out.
 * Computed when a cell is recorded and again when it is replayed; equal means
 * the replay's decisions, guard verdicts and outcome are the recording's.
 */
export function pathDigestOf(
	runs: ReadonlyArray<readonly EngineEvent[]>,
	workflow?: { events: readonly EngineEvent[]; stages: readonly unknown[] }
): string {
	// Over the events as a store reads them back (12-… D21): parsed, so the live run in memory and its stored copy digest alike.
	const keep = (held: readonly EngineEvent[]) =>
		engineEventSchema
			.array()
			.parse([...held])
			.filter((event) => PATH_EVENTS.has(event.type) && !isPlainAllow(event))
			.map((event) => ({
				type: event.type,
				tick: event.tick,
				// Who resolved an approval is the principal the run names, not what it decided (`approval.resolved.by`).
				payload: onPath(
					event.type === 'approval.resolved' ? { ...event.payload, by: undefined } : event.payload
				)
			}));
	return sha256Hex(
		canonicalJson({
			runs: runs.map(keep),
			// The stages by what they decided and how they ended — not the workflow run's own digest, which hashes the agent run ids in them.
			...(workflow
				? {
						workflow: {
							events: keep(workflow.events),
							stages: onPath(workflow.stages, new Set([...OFF_PATH, ...IDENTITY]))
						}
					}
				: {})
		})
	);
}
