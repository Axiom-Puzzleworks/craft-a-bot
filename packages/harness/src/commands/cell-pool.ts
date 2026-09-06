import { Worker } from 'node:worker_threads';
import type { CampaignCellSpec, CellResult } from '@craftabot/evals';
import type { WorkerInit, WorkerReply } from './campaign-worker.js';

/**
 * **The `--jobs` pool** (WP68, `57-HARNESS-AT-SCALE.md` §4.2): `size`
 * workers over the harness's own built `campaign-worker.js` — the same
 * relative path from `src/commands` and from `dist/commands`, so a test
 * over `src` runs the built worker. Each cell goes to the next idle
 * worker; the runner places the result by ordinal, so the order they come
 * back in does not matter. A worker that dies mid-cell fails that cell —
 * the campaign records the error and goes on, as a thrown cell does today.
 */
export interface CellPool {
	execute(spec: CampaignCellSpec): Promise<CellResult>;
	close(): Promise<void>;
}

const WORKER_URL = new URL('../../dist/commands/campaign-worker.js', import.meta.url);

interface Lane {
	worker: Worker;
	busy: boolean;
	pending?:
		| {
				ordinal: number;
				resolve: (result: CellResult) => void;
				reject: (error: Error) => void;
		  }
		| undefined;
}

export async function createCellPool(
	size: number,
	init: Omit<WorkerInit, 'kind'>
): Promise<CellPool> {
	const lanes: Lane[] = [];
	const waiting: Array<() => void> = [];

	async function spawn(): Promise<Lane> {
		const worker = new Worker(WORKER_URL);
		const lane: Lane = { worker, busy: false };
		const ready = new Promise<void>((resolve, reject) => {
			const onMessage = (reply: WorkerReply) => {
				if (reply.kind === 'ready') {
					worker.off('message', onMessage);
					resolve();
				} else if (reply.kind === 'failed') {
					worker.off('message', onMessage);
					reject(new Error(`a campaign worker could not start: ${reply.error}`));
				}
			};
			worker.on('message', onMessage);
			worker.once('error', reject);
		});
		worker.postMessage({ kind: 'init', ...init } satisfies WorkerInit);
		await ready;
		worker.on('message', (reply: WorkerReply) => {
			const pending = lane.pending;
			if (!pending) return;
			if (reply.kind === 'result' && reply.ordinal === pending.ordinal) {
				lane.pending = undefined;
				lane.busy = false;
				pending.resolve(reply.result);
				waiting.shift()?.();
			} else if (reply.kind === 'failed' && reply.ordinal === pending.ordinal) {
				lane.pending = undefined;
				lane.busy = false;
				pending.reject(new Error(reply.error));
				waiting.shift()?.();
			}
		});
		worker.on('error', (error) => {
			const pending = lane.pending;
			lane.pending = undefined;
			lane.busy = false;
			pending?.reject(error instanceof Error ? error : new Error(String(error)));
			waiting.shift()?.();
		});
		return lane;
	}

	for (let index = 0; index < size; index += 1) lanes.push(await spawn());

	async function idle(): Promise<Lane> {
		for (;;) {
			const lane = lanes.find((candidate) => !candidate.busy);
			if (lane) {
				lane.busy = true;
				return lane;
			}
			await new Promise<void>((resolve) => waiting.push(resolve));
		}
	}

	return {
		async execute(spec) {
			const lane = await idle();
			return new Promise<CellResult>((resolve, reject) => {
				lane.pending = { ordinal: spec.ordinal, resolve, reject };
				lane.worker.postMessage({ kind: 'cell', spec });
			});
		},
		async close() {
			await Promise.all(lanes.map((lane) => lane.worker.terminate()));
		}
	};
}
