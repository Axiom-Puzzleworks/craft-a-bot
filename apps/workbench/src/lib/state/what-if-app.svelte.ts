import { persistRunSummary } from '@craftabot/governance/reports';
import { runRecordFrom, toSpecV2 } from '@craftabot/core';
import { packVersions } from '$lib/packs.js';
import { isoAt } from '$lib/workshop/pipeline.js';
import { spawnCampaignWorker } from '$lib/worker/spawn.js';
import { appStorage } from './app-storage.svelte.js';
import { createWhatIf } from './what-if.svelte.js';
import type { AgentSpecV2, EngineEvent, StoredWorkflowRun } from '@craftabot/core';

/** A workflow run's agent runs into the store as the harness writes them: the record, the events, the summary (WP86). */
export type AgentRunsToPersist = ReadonlyArray<{
	runId: string;
	events: readonly EngineEvent[];
	spec: AgentSpecV2;
}>;

export async function persistAgentRuns(agentRuns: AgentRunsToPersist): Promise<void> {
	const storage = await appStorage();
	const versions = packVersions();
	for (const agentRun of agentRuns) {
		const events = agentRun.events;
		const finished = events.find((event) => event.type === 'run.finished');
		const outcome = finished?.type === 'run.finished' ? finished.payload.outcome : undefined;
		const startedAt = events[0]?.timestamp ?? isoAt(Date.now());
		const finishedAt = events.at(-1)?.timestamp ?? startedAt;
		const record = runRecordFrom({
			runId: agentRun.runId,
			spec: toSpecV2(agentRun.spec),
			events,
			packVersions: versions,
			startedAt,
			finishedAt,
			...(outcome ? { outcome } : {})
		});
		await storage.deleteEvents(record.id);
		await storage.putRun(record);
		await storage.appendEvents(record.id, events);
		await persistRunSummary(storage, record.id, events);
	}
}

/** A workflow run with its agent runs into the store — the campaign runner's book cells and the what-if share it. */
export async function persistWorkflowRun(
	stored: StoredWorkflowRun,
	agentRuns: AgentRunsToPersist
): Promise<void> {
	await persistAgentRuns(agentRuns);
	const storage = await appStorage();
	await storage.putWorkflowRun(stored);
}

/**
 * The app's what-if runner (WP86): its own Worker from the same module the
 * campaign runner spawns. Split from `what-if.svelte.ts` so the store's
 * tests never import the `?worker` module, which jsdom cannot construct.
 */
export const whatIf = createWhatIf({ spawn: spawnCampaignWorker, persist: persistWorkflowRun });
