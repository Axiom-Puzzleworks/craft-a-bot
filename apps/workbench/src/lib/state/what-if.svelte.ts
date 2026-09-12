import type { AgentSpecV2, EngineEvent, StoredWorkflowRun } from '@craftabot/core';
import { runWhatIfIn } from '$lib/worker/campaign-client.js';
import { isoAt } from '$lib/workshop/pipeline.js';
import type { WhatIfJob, WorkerLike } from '$lib/worker/protocol.js';

/**
 * **The what-if runner** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §4): one
 * re-run at a time, off the page — the Pipeline hands it a stored run, a
 * stage and the change; the Worker re-runs from that stage; the result is
 * stored as a workflow run of its own, forked from the original, with its
 * agent runs, before the page is told where it is. Module-level as the
 * campaign runner is, so the rail answers a click mid-run.
 */
export interface WhatIfDeps {
	spawn: () => WorkerLike;
	/** Where the new run and its agent runs go — the app's storage; a test's array. */
	persist: (
		stored: StoredWorkflowRun,
		agentRuns: ReadonlyArray<{ runId: string; events: readonly EngineEvent[]; spec: AgentSpecV2 }>
	) => Promise<void>;
	now?: () => number;
}

export function createWhatIf(deps: WhatIfDeps) {
	const now = deps.now ?? (() => Date.now());
	let worker: WorkerLike | undefined;
	let status = $state<'idle' | 'running' | 'done' | 'failed'>('idle');
	let error = $state<string | undefined>(undefined);
	/** The run the last what-if made, once stored. */
	let result = $state<StoredWorkflowRun | undefined>(undefined);
	let running: { cancel(): void } | undefined;

	async function run(job: WhatIfJob): Promise<StoredWorkflowRun> {
		worker ??= deps.spawn();
		running?.cancel();
		status = 'running';
		error = undefined;
		result = undefined;
		const handle = runWhatIfIn(worker, job);
		running = handle;
		try {
			const done = await handle.result;
			const stored: StoredWorkflowRun = {
				run: done.run,
				item: done.item,
				source: {
					kind: 'what-if',
					id: job.from.id,
					...(job.build !== undefined
						? { build: job.build }
						: job.configuration !== undefined
							? { build: job.configuration }
							: {})
				},
				forkedFrom: { runId: job.from.id, stageId: job.stageId },
				createdAt: isoAt(now()),
				schemaVersion: 1
			};
			await deps.persist(stored, done.agentRuns);
			result = stored;
			status = 'done';
			return stored;
		} catch (failure) {
			status = 'failed';
			error = failure instanceof Error ? failure.message : String(failure);
			throw failure;
		} finally {
			running = undefined;
		}
	}

	return {
		get status() {
			return status;
		},
		get error() {
			return error;
		},
		get result() {
			return result;
		},
		run,
		cancel: () => running?.cancel()
	};
}
