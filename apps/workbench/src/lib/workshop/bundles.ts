import {
	buildTraceBundle,
	type GroupRunRecord,
	type RunRecord,
	type Storage,
	type TraceBundle,
	type TraceExport
} from '@craftabot/core';

/**
 * **Bundles from the store** (`36-BUNDLE-AND-GROUPS.md` §4.4, WP48): what
 * the Audit Centre downloads and the Run Lab verifies for a group episode,
 * and the `TraceExport` a sink is handed for one — every member's own
 * trace, the merged stream, the evaluations.
 */

export async function exportForGroup(
	storage: Storage,
	group: GroupRunRecord
): Promise<TraceExport> {
	const members: Array<{ run: RunRecord; events: TraceExport['events'] }> = [];
	for (const memberId of group.memberRunIds) {
		const run = await storage.getRun(memberId);
		if (!run) continue;
		members.push({ run, events: (await storage.getEvents(memberId)).map((row) => row.event) });
	}
	const merged = (await storage.getEvents(group.id)).map((row) => row.event);
	const evaluations = (
		await Promise.all(group.memberRunIds.map((memberId) => storage.listEvaluations(memberId)))
	).flat();
	const first = members[0];
	if (!first) throw new Error('none of the episode’s member runs are in the store any more');
	return {
		run: first.run,
		events: first.events,
		group: { record: group, events: merged, members },
		evaluations
	};
}

export async function bundleForGroup(
	storage: Storage,
	group: GroupRunRecord,
	secrets: readonly string[]
): Promise<TraceBundle> {
	const input = await exportForGroup(storage, group);
	return buildTraceBundle({
		runs: input.group?.members ?? [],
		...(input.group ? { group: { record: input.group.record, events: input.group.events } } : {}),
		evaluations: input.evaluations ?? [],
		secrets,
		exportedBy: 'craftabot-workbench/0.0.1'
	});
}

export async function bundleForRun(
	storage: Storage,
	run: RunRecord,
	secrets: readonly string[]
): Promise<TraceBundle> {
	const events = (await storage.getEvents(run.id)).map((row) => row.event);
	const evaluations = await storage.listEvaluations(run.id);
	return buildTraceBundle({
		runs: [{ run, events }],
		evaluations,
		secrets,
		exportedBy: 'craftabot-workbench/0.0.1'
	});
}
