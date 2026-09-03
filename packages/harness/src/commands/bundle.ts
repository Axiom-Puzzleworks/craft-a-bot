import {
	buildTraceBundle,
	buildTraceFile,
	type TraceBundle,
	type TraceFile
} from '@craftabot/core';
import type { FileStorage } from '../storage/file-storage.js';

/**
 * `craftabot bundle` (WP37 stage B): a stored run back out as the trace file
 * the Workshop imports — record, events in `seq` order, digest — redacted
 * against every secret the process holds. The multi-run *bundle* format with
 * a digest over the whole (`26-…` §6.7) is WP48's; this command grows into
 * it, and is named for where it is going rather than what it is today.
 */
export async function bundleRun(
	storage: FileStorage,
	runId: string,
	secrets: readonly string[]
): Promise<TraceFile> {
	const run = await storage.getRun(runId);
	if (!run) throw new Error(`no run '${runId}' in ${storage.root}`);
	const events = (await storage.getEvents(runId)).map((row) => row.event);
	const evaluations = await storage.listEvaluations(runId);
	return buildTraceFile(run, events, { secrets, evaluations });
}

/** A group episode as one `craftabot-bundle` (WP48, `36-…` §4.4): every member's trace file, the merged stream, the evaluations, one digest. */
export async function bundleGroup(
	storage: FileStorage,
	groupRunId: string,
	secrets: readonly string[]
): Promise<TraceBundle> {
	const group = await storage.getGroupRun(groupRunId);
	if (!group) throw new Error(`no group episode '${groupRunId}' in ${storage.root}`);
	const runs: Array<{
		run: NonNullable<Awaited<ReturnType<FileStorage['getRun']>>>;
		events: TraceFile['events'];
	}> = [];
	for (const memberId of group.memberRunIds) {
		const run = await storage.getRun(memberId);
		if (!run) continue;
		runs.push({ run, events: (await storage.getEvents(memberId)).map((row) => row.event) });
	}
	if (runs.length === 0)
		throw new Error(`episode '${groupRunId}' has no member runs in ${storage.root}`);
	const events = (await storage.getEvents(groupRunId)).map((row) => row.event);
	const evaluations = (
		await Promise.all(group.memberRunIds.map((id) => storage.listEvaluations(id)))
	).flat();
	return buildTraceBundle({
		runs,
		group: { record: group, events },
		evaluations,
		secrets,
		exportedBy: 'craftabot-harness/0.0.1'
	});
}
