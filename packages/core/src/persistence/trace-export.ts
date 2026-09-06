import type { EvaluationRecord } from '../schemas/evaluation.js';
import type { EngineEvent } from '../schemas/events.js';
import {
	TRACE_FORMAT_VERSION,
	computeTraceDigest,
	traceFileSchema,
	type RunRecord,
	type TraceFile
} from '../schemas/trace-file.js';
import { redactSecrets } from './redact.js';

/**
 * Trace export (07-DATA-MODEL-PERSISTENCE.md §5) — the governance artefact
 * (08-GOVERNANCE-GUARDRAILS.md §4). An exported trace carries the spec
 * snapshot, the pack versions, and every event in order, so it is a
 * self-contained, replayable record of a run rather than a log.
 *
 * The digest is computed over the events *after* redaction, so it verifies the
 * bytes a recipient actually holds.
 */

export interface BuildTraceFileOptions {
	secrets?: readonly string[];
	/** The run's evaluations, carried in the file (WP43); redacted like everything else. */
	evaluations?: readonly EvaluationRecord[];
}

export async function buildTraceFile(
	run: RunRecord,
	events: readonly EngineEvent[],
	options: BuildTraceFileOptions = {}
): Promise<TraceFile> {
	const secrets = options.secrets ?? [];
	const safeRun = redactSecrets(run, secrets);
	const safeEvents = redactSecrets([...events], secrets);

	/*
	 * Parse first, digest second (WP65, `55-…` §2 item 7; `12-…` D21). The
	 * schema parse rebuilds every event with its keys in *schema* order, and
	 * a digest taken over the events as emitted only verified while the
	 * engine happened to emit keys in that order — a fork's `forkedFrom` and
	 * a principal broke the coincidence. The digest is over the events the
	 * file actually carries, which is what a reader re-hashes.
	 */
	const parsed = traceFileSchema.parse({
		format: 'craftabot-trace',
		formatVersion: TRACE_FORMAT_VERSION,
		run: safeRun,
		events: safeEvents,
		...(options.evaluations !== undefined
			? { evaluations: redactSecrets([...options.evaluations], secrets) }
			: {}),
		traceDigest: 'pending'
	});
	return { ...parsed, traceDigest: await computeTraceDigest(parsed.events) };
}

/** Re-checks a trace's digest — the integrity check a recipient runs (08 §4). */
export async function verifyTraceDigest(trace: TraceFile): Promise<boolean> {
	return (await computeTraceDigest(trace.events)) === trace.traceDigest;
}
