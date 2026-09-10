import type { AgentSpecV2, EngineEvent } from '@craftabot/core';
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
export interface StartBank {
	kind: 'start';
	job: string;
	work: 'bank';
	bank: unknown;
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

export type WorkerReply = JobProgress | JobTrace | JobDone | JobCancelled | JobFailed;

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
