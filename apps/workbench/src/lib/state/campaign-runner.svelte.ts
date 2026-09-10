import type { AgentSpecV2, EngineEvent } from '@craftabot/core';
import { campaignCells, campaignSchema, type CampaignReport } from '@craftabot/evals';
import { CampaignCancelled, runCampaignIn, type WorkerJob } from '$lib/worker/campaign-client.js';
import type { WorkerLike } from '$lib/worker/protocol.js';

/**
 * **The campaign runner, off the page** (WP77, `64-…` §6.6.1). The Campaigns
 * screen used to own its run: navigate away and the run died with the
 * component, and while it ran the tab did not answer (UX-12). Now the run
 * lives here — one Worker, spawned on first use, kept for the visit — with a
 * **queue**: several campaigns queued, one running, the tab live throughout,
 * and a report stored the moment it finishes whether or not anyone is
 * looking. The page reads this store; it no longer runs anything.
 *
 * Storage writes happen here, on the main thread, from the Worker's
 * messages: the Worker never opens the database (`65-…` §5 item 3's one
 * runner, and `57-…` §3's one writer).
 */
export type Trace = { events: readonly EngineEvent[]; spec: AgentSpecV2 };

export interface QueuedCampaign {
	id: string;
	title: string;
	cells: number;
	campaign: unknown;
	status: 'queued' | 'running' | 'done' | 'cancelled' | 'failed';
	error?: string | undefined;
}

export interface CampaignRunnerDeps {
	spawn: () => WorkerLike;
	/** Where a finished report goes — the app's storage; a test's array. */
	persist: (report: CampaignReport) => Promise<void>;
	now?: () => number;
}

let nextQueued = 0;

export function createCampaignRunner(deps: CampaignRunnerDeps) {
	const now = deps.now ?? (() => Date.now());
	let worker: WorkerLike | undefined;
	let job: WorkerJob | undefined;

	// Raw, not deep: the campaign inside an entry is handed to the Worker, and a deep-state proxy cannot be structured-cloned. The array is always reassigned whole.
	let queue = $state.raw<QueuedCampaign[]>([]);
	let current = $state<QueuedCampaign | undefined>(undefined);
	let progress = $state({ done: 0, total: 0 });
	let cancelRequested = $state(false);
	let startedAtMs = $state(0);
	/** When each cell finished — the trailing estimate's input (NEW-6). */
	let cellDoneAt = $state<number[]>([]);
	/** The last finished report and its traces, for the page that wants to drill in. */
	let report = $state<CampaignReport | undefined>(undefined);
	let traces = $state.raw<Record<string, Trace>>({});
	let draining = false;

	async function drain(): Promise<void> {
		if (draining) return;
		draining = true;
		try {
			for (;;) {
				const next = queue.find((entry) => entry.status === 'queued');
				if (!next) break;
				await runOne(next);
			}
		} finally {
			draining = false;
		}
	}

	function setStatus(id: string, status: QueuedCampaign['status'], error?: string): void {
		queue = queue.map((entry) =>
			entry.id === id ? { ...entry, status, ...(error !== undefined ? { error } : {}) } : entry
		);
	}

	async function runOne(entry: QueuedCampaign): Promise<void> {
		worker ??= deps.spawn();
		current = entry;
		setStatus(entry.id, 'running');
		cancelRequested = false;
		startedAtMs = now();
		cellDoneAt = [startedAtMs];
		progress = { done: 0, total: entry.cells };
		const collected: Record<string, Trace> = {};
		job = runCampaignIn(worker, entry.campaign, {
			onProgress: (done, total) => {
				progress = { done, total };
				cellDoneAt = [...cellDoneAt, now()];
			},
			onTrace: (cell, trace) => {
				if (cell.runId) collected[cell.runId] = trace;
			}
		});
		try {
			const finished = await job.result;
			await deps.persist(finished);
			// Shown only once stored (WP56 stage A): a verdict on screen ahead of the
			// report a safety case reads left the screen honest and the store empty.
			traces = collected;
			report = finished;
			setStatus(entry.id, 'done');
		} catch (error) {
			if (error instanceof CampaignCancelled) {
				progress = { done: error.done, total: error.total };
				setStatus(entry.id, 'cancelled');
			} else {
				setStatus(entry.id, 'failed', error instanceof Error ? error.message : String(error));
			}
		} finally {
			job = undefined;
			current = undefined;
		}
	}

	return {
		get queue() {
			return queue;
		},
		get current() {
			return current;
		},
		get running() {
			return current !== undefined;
		},
		get progress() {
			return progress;
		},
		get cancelRequested() {
			return cancelRequested;
		},
		get startedAtMs() {
			return startedAtMs;
		},
		get cellDoneAt() {
			return cellDoneAt;
		},
		get report() {
			return report;
		},
		get traces() {
			return traces;
		},
		/** Queue a campaign; it runs when the Worker is free. Returns the queue entry, or the reason it was refused. */
		enqueue(source: unknown): QueuedCampaign | string {
			const parsed = campaignSchema.safeParse(source);
			if (!parsed.success) return parsed.error.issues[0]?.message ?? 'invalid campaign';
			if (parsed.data.brains.some((brain) => brain.tier === 'live')) {
				return 'a campaign with a live brain runs from the harness, not here';
			}
			const entry: QueuedCampaign = {
				id: `queued-${(nextQueued += 1)}`,
				title: parsed.data.title,
				cells: campaignCells(parsed.data).length,
				campaign: parsed.data,
				status: 'queued'
			};
			queue = [...queue, entry];
			void drain();
			return entry;
		},
		/** Stop the running campaign at its next cell boundary; nothing is stored for it. */
		cancel(): void {
			if (!job) return;
			cancelRequested = true;
			job.cancel();
		},
		/** Drop a queued (not running) entry, or forget a finished one. */
		remove(id: string): void {
			queue = queue.filter((entry) => entry.id !== id || entry.status === 'running');
		},
		/** The page opened a stored report instead: forget the live one's traces. */
		showStored(stored: CampaignReport): void {
			report = stored;
			traces = {};
		},
		forgetReport(): void {
			report = undefined;
			traces = {};
		}
	};
}

export type CampaignRunner = ReturnType<typeof createCampaignRunner>;
