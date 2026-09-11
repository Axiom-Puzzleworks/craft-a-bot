import type { AgentSpecV2, EngineEvent } from '@craftabot/core';
import type { CampaignCell, CampaignReport } from '@craftabot/evals';
import type { CampaignHost } from './campaign-host.js';
import type {
	BankJob,
	JobArrival,
	JobBankDone,
	JobWorkflowRun,
	WorkerLike,
	WorkerReply,
	WorkerRequest
} from './protocol.js';

/**
 * **The main thread's side** (WP77): one campaign sent to a Worker, its
 * progress and traces relayed, its report returned — or its cancellation,
 * as a `CampaignCancelled` rejection the caller tells apart from a failure.
 * The client owns nothing but the listener it adds; the Worker is handed
 * in, so the app's singleton and a test's in-process double read alike.
 */
export class CampaignCancelled extends Error {
	constructor(
		readonly done: number,
		readonly total: number
	) {
		super('cancelled');
	}
}

export interface RunInWorkerOptions {
	onProgress?: (done: number, total: number) => void;
	onTrace?: (
		cell: CampaignCell,
		trace: { events: readonly EngineEvent[]; spec: AgentSpecV2 }
	) => void;
	/** The fixed clock and id a test passes to prove byte identity; never set by the app. */
	fixed?: { now: string; reportId: string } | undefined;
}

export interface WorkerJob {
	readonly result: Promise<CampaignReport>;
	cancel(): void;
}

let nextJob = 0;

export function runCampaignIn(
	worker: WorkerLike,
	campaign: unknown,
	options: RunInWorkerOptions = {}
): WorkerJob {
	const job = `job-${(nextJob += 1)}`;
	const result = new Promise<CampaignReport>((resolve, reject) => {
		const listener = ({ data }: { data: WorkerReply }) => {
			if (data.job !== job) return;
			switch (data.kind) {
				case 'progress':
					options.onProgress?.(data.done, data.total);
					return;
				case 'trace':
					options.onTrace?.(data.cell, { events: data.events, spec: data.spec });
					return;
				case 'done':
					worker.removeEventListener('message', listener);
					resolve(data.report);
					return;
				case 'cancelled':
					worker.removeEventListener('message', listener);
					reject(new CampaignCancelled(data.done, data.total));
					return;
				case 'failed':
					worker.removeEventListener('message', listener);
					reject(new Error(data.error));
					return;
			}
		};
		worker.addEventListener('message', listener);
		worker.postMessage({
			kind: 'start',
			job,
			work: 'campaign',
			campaign,
			...(options.fixed ? { fixed: options.fixed } : {})
		});
	});
	return { result, cancel: () => worker.postMessage({ kind: 'cancel', job }) };
}

/**
 * A Worker with no thread: the host wired straight to the listeners, each
 * reply delivered on its own macrotask as a real Worker's would be. The
 * byte-identity test runs the runner through this and directly, and
 * compares (`65-…` WP77's DoD).
 */
export function inProcessWorker(makeHost: (post: (reply: WorkerReply) => void) => CampaignHost) {
	const listeners = new Set<(event: { data: WorkerReply }) => void>();
	const host = makeHost((reply) => {
		setTimeout(() => {
			for (const listener of [...listeners]) listener({ data: reply });
		}, 0);
	});
	const worker: WorkerLike = {
		postMessage(message: WorkerRequest) {
			setTimeout(() => host.handle(message), 0);
		},
		addEventListener(_type, listener) {
			listeners.add(listener);
		},
		removeEventListener(_type, listener) {
			listeners.delete(listener);
		}
	};
	return worker;
}

/** A day at the bank in the Worker (WP83): progress as items are worked, every agent run as a trace, and the `BankRun` with the workflow runs at the end. */
export interface RunBankInOptions extends RunInWorkerOptions {
	/** Every arrival as the clock delivers it (WP84). */
	onArrival?: (arrival: Omit<JobArrival, 'kind' | 'job'>) => void;
	/** Every workflow run as it finishes, its agent events attached (WP84). */
	onWorkflowRun?: (entry: Omit<JobWorkflowRun, 'kind' | 'job'>) => void;
}

export function runBankIn(
	worker: WorkerLike,
	bank: BankJob,
	options: RunBankInOptions = {}
): { result: Promise<Omit<JobBankDone, 'kind' | 'job'>>; cancel(): void } {
	const job = `job-${(nextJob += 1)}`;
	const result = new Promise<Omit<JobBankDone, 'kind' | 'job'>>((resolve, reject) => {
		const listener = ({ data }: { data: WorkerReply }) => {
			if (data.job !== job) return;
			switch (data.kind) {
				case 'progress':
					options.onProgress?.(data.done, data.total);
					return;
				case 'trace':
					options.onTrace?.(data.cell, { events: data.events, spec: data.spec });
					return;
				case 'arrival':
					options.onArrival?.({
						...(data.desk !== undefined ? { desk: data.desk } : {}),
						itemId: data.itemId,
						itemKind: data.itemKind,
						at: data.at
					});
					return;
				case 'workflow-run':
					options.onWorkflowRun?.({
						desk: data.desk,
						item: data.item,
						run: data.run,
						events: data.events
					});
					return;
				case 'bank-done':
					worker.removeEventListener('message', listener);
					resolve({ bank: data.bank, runs: data.runs });
					return;
				case 'failed':
					worker.removeEventListener('message', listener);
					reject(new Error(data.error));
					return;
				default:
					return;
			}
		};
		worker.addEventListener('message', listener);
		worker.postMessage({ kind: 'start', job, work: 'bank', bank });
	});
	return { result, cancel: () => worker.postMessage({ kind: 'cancel', job }) };
}
