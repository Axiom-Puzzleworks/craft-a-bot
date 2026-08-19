import {
	DEFAULT_REQUEST_TIMEOUT_MS,
	DEFAULT_TICK_BUDGET,
	DEFAULT_TOKEN_BUDGET,
	type AnyAgentSpec,
	type EngineEvent,
	type GroupRunRecord,
	type RunRecord
} from '@craftabot/core';
import { packVersions } from '../packs.js';
import type { Storage } from './storage.js';

/**
 * Turns a finished group episode — specs plus the events it actually produced
 * — into stored rows (WP29, `23-MULTI-AGENT-DESIGN.md` §4.7, §10 stage F):
 * the group-altitude counterpart to the play route's own `toRunRecord`, and
 * derived from events the same way, for the same reason (hard rule 3 — if it
 * is not in an event it did not happen).
 *
 * **No live UI calls this yet.** Nothing in the Kit or the Workshop can start
 * a group episode (WP31's job, by the roadmap's own split, `23-…` §2). This
 * is the seam a future live recorder calls incrementally and this stage's own
 * e2e proof calls once, over a `SessionGroup` already run to completion
 * through `@craftabot/pack-starter/testing`'s `runGroupToCompletion` — "driven
 * through a test entry point, since no Kit UI exists" (`23-…` §10 stage F).
 */

export interface GroupEpisodeMember {
	spec: AnyAgentSpec;
	/** This member's own trace, in order — what `SessionGroup.sessions[n].events` would replay to. */
	events: EngineEvent[];
}

export interface GroupEpisode {
	groupRunId: string;
	goalCardId: string;
	members: GroupEpisodeMember[];
	/** The merged stream, in arrival order — `SessionGroup.events`'s own output. */
	mergedEvents: EngineEvent[];
}

/** Everything a member's own `RunRecord` needs that only that member's own trace can say. */
function memberRunRecord(
	member: GroupEpisodeMember,
	groupRunId: string,
	pinned: boolean
): RunRecord {
	const started = member.events.find((event) => event.type === 'run.started');
	const finished = member.events.find((event) => event.type === 'run.finished');
	const startedFacts = started?.type === 'run.started' ? started.payload : undefined;
	const finishedFacts = finished?.type === 'run.finished' ? finished.payload : undefined;

	return {
		id: member.events[0]?.runId ?? crypto.randomUUID(),
		agentId: member.spec.id,
		agentName: member.spec.name,
		goalCardId: member.spec.goalCardId,
		specSnapshot: member.spec,
		packVersions: packVersions(),
		mode: startedFacts?.mode ?? 'step',
		outcome: finishedFacts?.outcome ?? 'IN_PROGRESS',
		ticks: finishedFacts?.ticks ?? member.events.at(-1)?.tick ?? 0,
		usage: finishedFacts?.usage ?? { inputTokens: 0, outputTokens: 0 },
		budgets: startedFacts?.budgets ?? {
			maxTicks: DEFAULT_TICK_BUDGET,
			maxTokens: DEFAULT_TOKEN_BUDGET,
			requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
		},
		providerId: startedFacts?.providerId ?? 'unrecorded',
		wireModel: startedFacts?.wireModel ?? 'unrecorded',
		pinned,
		startedAt: started?.timestamp ?? new Date().toISOString(),
		...(finished ? { finishedAt: finished.timestamp } : {}),
		groupRunId,
		schemaVersion: 2
	};
}

/** Everything the group's own row needs, from `group.started`/`group.finished` on the merged stream. */
function buildGroupRunRecord(
	episode: GroupEpisode,
	memberRuns: RunRecord[],
	pinned: boolean
): GroupRunRecord {
	const started = episode.mergedEvents.find((event) => event.type === 'group.started');
	const finished = episode.mergedEvents.find((event) => event.type === 'group.finished');
	const finishedFacts = finished?.type === 'group.finished' ? finished.payload : undefined;

	return {
		id: episode.groupRunId,
		goalCardId: episode.goalCardId,
		memberRunIds: memberRuns.map((run) => run.id),
		memberAgentIds: memberRuns.map((run) => run.agentId),
		outcome: finishedFacts?.outcome ?? 'IN_PROGRESS',
		rounds: finishedFacts?.rounds ?? episode.mergedEvents.at(-1)?.tick ?? 0,
		usage: finishedFacts?.usage ?? { inputTokens: 0, outputTokens: 0 },
		pinned,
		startedAt: started?.timestamp ?? memberRuns[0]?.startedAt ?? new Date().toISOString(),
		...(finished ? { finishedAt: finished.timestamp } : {}),
		schemaVersion: 1
	};
}

/**
 * Writes every row a finished episode needs: each member's own `RunRecord`
 * (carrying `groupRunId` back to the group) and its own events, then the
 * group's own `GroupRunRecord` and the merged stream — each written through
 * the ordinary `Storage` methods a solo Kit run already uses (`23-…` §4.7:
 * "the storage layer needs no changes"). Returns the row written, so a caller
 * can link straight to it.
 */
export async function recordGroupEpisode(
	storage: Storage,
	episode: GroupEpisode,
	options: { pinned?: boolean } = {}
): Promise<GroupRunRecord> {
	const pinned = options.pinned ?? false;
	const memberRuns = episode.members.map((member) =>
		memberRunRecord(member, episode.groupRunId, pinned)
	);

	for (let index = 0; index < episode.members.length; index++) {
		const member = episode.members[index];
		const run = memberRuns[index];
		if (!member || !run) continue;
		await storage.putRun(run);
		await storage.appendEvents(run.id, member.events);
	}

	const groupRun = buildGroupRunRecord(episode, memberRuns, pinned);
	await storage.putGroupRun(groupRun);
	await storage.appendEvents(groupRun.id, episode.mergedEvents);
	return groupRun;
}
