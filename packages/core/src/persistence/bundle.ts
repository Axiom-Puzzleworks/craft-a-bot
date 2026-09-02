import type { EvaluationRecord } from '../schemas/evaluation.js';
import type { EngineEvent } from '../schemas/events.js';
import type { GroupRunRecord } from '../schemas/records.js';
import {
	BUNDLE_FORMAT_VERSION,
	computeBundleDigest,
	traceBundleSchema,
	type TraceBundle
} from '../schemas/trace-bundle.js';
import { computeTraceDigest, type RunRecord } from '../schemas/trace-file.js';
import { redactSecrets } from './redact.js';
import { buildTraceFile } from './trace-export.js';

/**
 * **Building and verifying a bundle** (`36-…` §4.1, WP48). Each member goes
 * through `buildTraceFile`, so redaction and the per-run digest are the
 * ones every reader already trusts; the group section is the redacted
 * merged stream with its own digest; the bundle digest is over every
 * digest inside. Verification recomputes all three levels.
 */

export interface BuildTraceBundleOptions {
	runs: ReadonlyArray<{ run: RunRecord; events: readonly EngineEvent[] }>;
	group?: { record: GroupRunRecord; events: readonly EngineEvent[] };
	evaluations?: readonly EvaluationRecord[];
	campaign?: { id: string; cellId: string };
	secrets?: readonly string[];
	exportedBy: string;
	exportedAt?: string;
}

export async function buildTraceBundle(options: BuildTraceBundleOptions): Promise<TraceBundle> {
	const secrets = options.secrets ?? [];
	const runs = await Promise.all(
		options.runs.map(({ run, events }) => buildTraceFile(run, events, { secrets }))
	);
	const evaluations = redactSecrets([...(options.evaluations ?? [])], secrets);
	let group: TraceBundle['group'];
	if (options.group) {
		const events = redactSecrets([...options.group.events], secrets);
		group = {
			record: redactSecrets(options.group.record, secrets),
			events,
			groupDigest: await computeTraceDigest(events)
		};
	}
	const bundleDigest = await computeBundleDigest({
		runDigests: runs.map((trace) => trace.traceDigest),
		groupDigest: group?.groupDigest,
		evaluationIds: evaluations.map((record) => record.id)
	});
	return traceBundleSchema.parse({
		format: 'craftabot-bundle',
		formatVersion: BUNDLE_FORMAT_VERSION,
		exportedAt: options.exportedAt ?? new Date().toISOString(),
		exportedBy: options.exportedBy,
		runs,
		...(group ? { group } : {}),
		evaluations,
		...(options.campaign ? { campaign: options.campaign } : {}),
		bundleDigest
	});
}

/** Every level recomputed: each member's digest over its events, the group's over the merged stream, the bundle's over all of them. */
export async function verifyBundleDigest(bundle: TraceBundle): Promise<boolean> {
	for (const trace of bundle.runs) {
		if ((await computeTraceDigest(trace.events)) !== trace.traceDigest) return false;
	}
	if (
		bundle.group &&
		(await computeTraceDigest(bundle.group.events)) !== bundle.group.groupDigest
	) {
		return false;
	}
	const expected = await computeBundleDigest({
		runDigests: bundle.runs.map((trace) => trace.traceDigest),
		groupDigest: bundle.group?.groupDigest,
		evaluationIds: bundle.evaluations.map((record) => record.id)
	});
	return expected === bundle.bundleDigest;
}
