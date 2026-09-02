import { buildTraceFile, type TraceFile } from '@craftabot/core';
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
