import type { AgentSpecV2, BankRun, EngineEvent, WorkItem, WorkflowRun } from '@craftabot/core';
import type { CampaignCell, CampaignReport } from '@craftabot/evals';

/**
 * **The Worker's message protocol** (WP77, `64-TARGET-DESIGN-V5.md` §6.6.1,
 * D7; UX-12's other half). One module Worker hosts the campaign runner —
 * and, once WP80 and WP83 land, the book runner and the bank clock — behind
 * these messages. The main thread sends a job and a cancel; the Worker
 * answers with progress, each cell's trace, and the finished report or the
 * reason it is not one. Storage is never touched inside the Worker: the
 * main thread is the one writer, exactly as the harness's pool has it
 * (`57-HARNESS-AT-SCALE.md` §3), so the persistence code is untouched.
 *
 * Every message is plain data — structured-cloneable — and carries the
 * job's id, so a queue of several jobs on one Worker never confuses a
 * late trace with the next job's.
 */

/** A campaign to run, with the plan chain and packs the Worker already holds. */
export interface StartCampaign {
	kind: 'start';
	job: string;
	work: 'campaign';
	/** The parsed campaign, as JSON. */
	campaign: unknown;
	/**
	 * A fixed clock and report id, so a test can prove the Worker's report is
	 * byte-identical to the main thread's. The app never sets it: a report's
	 * id and `createdAt` are then the runner's own, as today.
	 */
	fixed?: { now: string; reportId: string } | undefined;
}

/**
 * A book run (WP80, `73-…` §4): a campaign whose `source` names a book and a
 * workflow — the same runner, the same report — so the Books and Sweeps
 * tabs queue one exactly as the Campaigns tab queues a campaign. The kind
 * stays for a host that wants to say what it is sending; the Worker treats
 * it as the campaign it is.
 */
export interface StartBook {
	kind: 'start';
	job: string;
	work: 'book';
	/** The campaign, with its `source`. */
	book: unknown;
	fixed?: { now: string; reportId: string } | undefined;
}
/**
 * A day at the bank in the Worker (WP83, `71-THE-CLOCK.md` §5): the
 * population at a seed and size, a window, the desks — the host draws the
 * books from the edition's packs, runs the bank with the scripted brains,
 * posts every agent run as a `trace` and finishes with `bank-done`.
 */
export interface BankJob {
	population: { seed: number; size: number };
	from: string;
	to: string;
	desks: Array<{
		id: string;
		workflowId: string;
		kinds: WorkItem['kind'][];
		configuration?: string;
		knobs?: Record<string, number | string | boolean>;
		concurrency: number;
		build?: string;
	}>;
	/** Simulated seconds per wall second; absent means as fast as it can. */
	acceleration?: number;
	stopAfter?: number;
}
export interface StartBank {
	kind: 'start';
	job: string;
	work: 'bank';
	bank: BankJob;
}

export interface CancelJob {
	kind: 'cancel';
	job: string;
}

export type WorkerRequest = StartCampaign | StartBook | StartBank | CancelJob;

export interface JobProgress {
	kind: 'progress';
	job: string;
	done: number;
	total: number;
}

/** A finished cell's trace — the events and the spec — so the main thread can open it in the Run Lab. */
export interface JobTrace {
	kind: 'trace';
	job: string;
	cell: CampaignCell;
	events: readonly EngineEvent[];
	spec: AgentSpecV2;
}

export interface JobDone {
	kind: 'done';
	job: string;
	report: CampaignReport;
}

export interface JobCancelled {
	kind: 'cancelled';
	job: string;
	done: number;
	total: number;
}

export interface JobFailed {
	kind: 'failed';
	job: string;
	error: string;
}

/** An arrival on the bank's clock (WP84, `75-THE-MONITOR.md` §4): the item's kind and time, and the desk it was routed to — none for an unrouted kind. */
export interface JobArrival {
	kind: 'arrival';
	job: string;
	desk?: string | undefined;
	itemId: string;
	itemKind: WorkItem['kind'];
	at: string;
}

/** A workflow run finished on a desk (WP84): the run with the events of the agent runs it made, so the Monitor folds it as it lands. */
export interface JobWorkflowRun {
	kind: 'workflow-run';
	job: string;
	desk: string;
	item: WorkItem;
	run: WorkflowRun;
	events: readonly EngineEvent[];
}

/** A bank day finished: the `BankRun` and every workflow run it made. */
export interface JobBankDone {
	kind: 'bank-done';
	job: string;
	bank: BankRun;
	runs: Array<{ desk: string; item: WorkItem; run: WorkflowRun }>;
}

export type WorkerReply =
	| JobProgress
	| JobTrace
	| JobDone
	| JobArrival
	| JobWorkflowRun
	| JobBankDone
	| JobCancelled
	| JobFailed;

/**
 * What both sides of the protocol need of a Worker: `postMessage` and a
 * message listener. The real `Worker` has both; a test wires the host
 * straight to the client with nothing in between (`inProcessWorker`).
 */
export interface WorkerLike {
	postMessage(message: WorkerRequest): void;
	addEventListener(type: 'message', listener: (event: { data: WorkerReply }) => void): void;
	removeEventListener(type: 'message', listener: (event: { data: WorkerReply }) => void): void;
}
