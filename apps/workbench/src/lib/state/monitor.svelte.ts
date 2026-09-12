import type { BankRun, WorkItem } from '@craftabot/core';
import {
	foldMonitor,
	referenceFromItems,
	type MonitorArrival,
	type MonitorRun,
	type MonitorState
} from '@craftabot/evals';
import { runBankIn } from '$lib/worker/campaign-client.js';
import type { BankJob, WorkerLike } from '$lib/worker/protocol.js';

/**
 * **The Monitor's store** (WP84, `75-THE-MONITOR.md` §5): the bank's day
 * runs in the Worker and streams here — every arrival, every workflow run
 * with its agent events — and the page reads a fold over what has been
 * kept. The store lives at module level, as the campaign runner does
 * (WP77), so the day keeps running and the numbers keep folding while the
 * rail changes the route; nothing is written to storage — the Monitor
 * watches, the Campaigns screen keeps.
 *
 * **Play** folds each run as it lands; **Pause** keeps them and folds none,
 * so the numbers freeze; **Step** folds one; **Replay** clears the fold and
 * re-folds the kept runs in arrival order a few at a time, drawing the same
 * picture because `foldMonitor` is a function of its inputs (and the runs
 * are the same bytes by WP83's digest).
 */
export type MonitorStatus = 'idle' | 'running' | 'done' | 'failed';
export type MonitorMode = 'play' | 'pause';

export interface MonitorDeskSetup {
	id: string;
	workflowId: string;
	kinds: WorkItem['kind'][];
	configuration?: string | undefined;
	concurrency: number;
}

export interface MonitorSetup {
	seed: number;
	size: number;
	from: string;
	to: string;
	/** Simulated seconds per wall second; `Infinity` for as fast as it can. */
	acceleration: number;
	desks: MonitorDeskSetup[];
	window: number;
	minimum: number;
}

export interface MonitorDeps {
	spawn: () => WorkerLike;
	/** Per workflow id, its decision-kind reader, for the ceilings. */
	decisionKindOf?: (
		workflowId: string
	) => ((stageId: string, output: unknown) => string | undefined) | undefined;
	/** How many runs Replay folds per tick, and the tick. */
	replayBatch?: number;
	replayTickMs?: number;
	setInterval?: typeof globalThis.setInterval;
	clearInterval?: typeof globalThis.clearInterval;
}

export function createMonitor(deps: MonitorDeps) {
	let worker: WorkerLike | undefined;
	let job: { cancel(): void } | undefined;
	let replayTimer: ReturnType<typeof setInterval> | undefined;
	const schedule = deps.setInterval ?? globalThis.setInterval;
	const unschedule = deps.clearInterval ?? globalThis.clearInterval;

	let status = $state<MonitorStatus>('idle');
	let mode = $state<MonitorMode>('play');
	let error = $state<string | undefined>(undefined);
	let setup = $state<MonitorSetup | undefined>(undefined);
	// Raw: the runs come from the Worker and are never mutated; the arrays are reassigned whole.
	let kept = $state.raw<readonly MonitorRun[]>([]);
	let arrivals = $state.raw<readonly MonitorArrival[]>([]);
	/** How many of `kept` the fold reads — all of them while playing. */
	let folded = $state(0);
	let bank = $state<BankRun | undefined>(undefined);
	let replaying = $state(false);
	let startedAtMs = $state(0);
	let finishedAtMs = $state<number | undefined>(undefined);

	const visible = $derived<readonly MonitorRun[]>(kept.slice(0, folded));
	/** The simulated clock: the latest arrival or finish the fold has seen. */
	const clock = $derived.by(() => {
		const lastRun = visible.at(-1)?.run.finishedAt;
		const lastArrival = mode === 'play' && !replaying ? arrivals.at(-1)?.at : undefined;
		return [lastRun, lastArrival]
			.filter((v): v is string => v !== undefined)
			.sort()
			.at(-1);
	});
	const state = $derived<MonitorState | undefined>(
		setup
			? foldMonitor(visible, {
					from: setup.from,
					to: setup.to,
					window: setup.window,
					minimum: setup.minimum,
					reference: referenceFromItems(visible.map((entry) => entry.item)),
					desks: setup.desks.map((desk) => ({ id: desk.id, concurrency: desk.concurrency })),
					// While paused, the queue view stops at the fold too: arrivals after the last folded run are not shown.
					arrivals:
						mode === 'play' && !replaying
							? arrivals
							: arrivals.filter((arrival) => clock !== undefined && arrival.at <= clock),
					...(clock !== undefined ? { now: clock } : {}),
					...(deps.decisionKindOf ? { decisionKindOf: deps.decisionKindOf } : {})
				})
			: undefined
	);

	function stopReplay(): void {
		if (replayTimer !== undefined) unschedule(replayTimer);
		replayTimer = undefined;
		replaying = false;
	}

	function start(next: MonitorSetup): void {
		job?.cancel();
		stopReplay();
		worker ??= deps.spawn();
		setup = next;
		status = 'running';
		mode = 'play';
		error = undefined;
		kept = [];
		arrivals = [];
		folded = 0;
		bank = undefined;
		startedAtMs = Date.now();
		finishedAtMs = undefined;
		const request: BankJob = {
			population: { seed: next.seed, size: next.size },
			from: next.from,
			to: next.to,
			desks: next.desks.map((desk) => ({
				id: desk.id,
				workflowId: desk.workflowId,
				kinds: [...desk.kinds],
				...(desk.configuration !== undefined ? { configuration: desk.configuration } : {}),
				concurrency: desk.concurrency
			})),
			...(Number.isFinite(next.acceleration) ? { acceleration: next.acceleration } : {})
		};
		const handle = runBankIn(worker, request, {
			onArrival: (arrival) => {
				arrivals = [
					...arrivals,
					{
						...(arrival.desk !== undefined ? { desk: arrival.desk } : {}),
						itemId: arrival.itemId,
						kind: arrival.itemKind,
						at: arrival.at
					}
				];
			},
			onWorkflowRun: (entry) => {
				kept = [
					...kept,
					{ desk: entry.desk, item: entry.item, run: entry.run, agentEvents: entry.events }
				];
				if (mode === 'play' && !replaying) folded = kept.length;
			}
		});
		job = handle;
		void handle.result.then(
			(done) => {
				if (job !== handle) return;
				bank = done.bank;
				status = 'done';
				finishedAtMs = Date.now();
				job = undefined;
			},
			(failure: unknown) => {
				if (job !== handle) return;
				status = 'failed';
				error = failure instanceof Error ? failure.message : String(failure);
				finishedAtMs = Date.now();
				job = undefined;
			}
		);
	}

	function play(): void {
		stopReplay();
		mode = 'play';
		folded = kept.length;
	}

	function pause(): void {
		stopReplay();
		mode = 'pause';
	}

	/** One more run into the fold; pauses first, so the numbers move only when asked. */
	function step(): void {
		stopReplay();
		mode = 'pause';
		if (folded < kept.length) folded += 1;
	}

	/** The same picture again: the fold emptied and refilled from the kept runs, a batch a tick. */
	function replay(): void {
		stopReplay();
		mode = 'pause';
		folded = 0;
		replaying = true;
		const batch = deps.replayBatch ?? 5;
		replayTimer = schedule(() => {
			folded = Math.min(kept.length, folded + batch);
			if (folded >= kept.length) {
				stopReplay();
				mode = status === 'running' ? 'play' : 'pause';
				if (mode === 'play') folded = kept.length;
			}
		}, deps.replayTickMs ?? 40);
	}

	function cancel(): void {
		job?.cancel();
	}

	return {
		get status() {
			return status;
		},
		get mode() {
			return mode;
		},
		get error() {
			return error;
		},
		get setup() {
			return setup;
		},
		get kept() {
			return kept;
		},
		get arrivals() {
			return arrivals;
		},
		get folded() {
			return folded;
		},
		get bank() {
			return bank;
		},
		get replaying() {
			return replaying;
		},
		get clock() {
			return clock;
		},
		get state() {
			return state;
		},
		get wallMs() {
			return startedAtMs === 0 ? 0 : (finishedAtMs ?? Date.now()) - startedAtMs;
		},
		start,
		play,
		pause,
		step,
		replay,
		cancel
	};
}
