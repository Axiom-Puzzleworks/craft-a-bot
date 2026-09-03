import type { EngineEvent, EventBus, Unsubscribe } from '@craftabot/core';
import type { SinkError, SinkResult, SinkStatus, TraceExport } from './types.js';

/**
 * **The live half every sink shares** (`35-…` §4.1): subscribe, buffer,
 * flush when the run ends, when the buffer is full, or after a quiet
 * interval — and never let a failure past `status()` and `onError`. A sink
 * supplies only `send(events, run)`; the rest is here so no vendor's sink
 * reinvents the discipline and gets it wrong.
 */

export interface BatchingOptions {
	sinkId: string;
	batchSize: number;
	flushAfterMs: number;
	/** Send these events (a live batch) for this run. May throw or reject; the batcher counts it. */
	send(events: readonly EngineEvent[], run: { runId: string; agentId: string }): Promise<number>;
	/** Send a whole finished trace. May throw or reject; the batcher counts it. */
	sendExport(input: TraceExport): Promise<number>;
	onError?: ((error: SinkError) => void) | undefined;
	now?: (() => number) | undefined;
	/** The timer, injectable for tests; `setTimeout` by default. */
	schedule?: ((callback: () => void, ms: number) => () => void) | undefined;
}

export interface Batcher {
	attach(events: EventBus, run: { runId?: string; agentId: string }): Unsubscribe;
	export(input: TraceExport): Promise<SinkResult>;
	flush(): Promise<void>;
	status(): SinkStatus;
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function createBatcher(options: BatchingOptions): Batcher {
	const schedule =
		options.schedule ??
		((callback: () => void, ms: number) => {
			const handle = setTimeout(callback, ms);
			return () => clearTimeout(handle);
		});
	let buffer: EngineEvent[] = [];
	let current: { runId: string; agentId: string } | undefined;
	let attached = false;
	let sent = 0;
	let failed = 0;
	let lastError: string | undefined;
	let cancelTimer: (() => void) | undefined;
	let inFlight: Promise<void> = Promise.resolve();

	function fail(during: SinkError['during'], error: unknown): void {
		failed += 1;
		lastError = messageOf(error);
		options.onError?.({ sinkId: options.sinkId, message: lastError, during });
	}

	function flushNow(): Promise<void> {
		cancelTimer?.();
		cancelTimer = undefined;
		// Nothing to send: still wait for what is in flight, so a caller's flush means "everything so far has landed".
		if (buffer.length === 0 || current === undefined) return inFlight;
		const batch = buffer;
		const run = current;
		buffer = [];
		// Serialised: a second flush waits for the first, so batches arrive in order.
		inFlight = inFlight.then(async () => {
			try {
				sent += await options.send(batch, run);
			} catch (error) {
				fail('flush', error);
			}
		});
		return inFlight;
	}

	function arm(): void {
		if (cancelTimer !== undefined) return;
		cancelTimer = schedule(() => {
			cancelTimer = undefined;
			void flushNow();
		}, options.flushAfterMs);
	}

	return {
		attach(events, run) {
			current = run.runId !== undefined ? { runId: run.runId, agentId: run.agentId } : undefined;
			attached = true;
			const off = events.onAny((event) => {
				// A host that attaches before the run starts leaves the id to the stream (WP47).
				current ??= { runId: event.runId, agentId: run.agentId };
				buffer.push(event);
				if (event.type === 'run.finished' || event.type === 'group.finished') {
					void flushNow();
					return;
				}
				if (buffer.length >= options.batchSize) {
					void flushNow();
					return;
				}
				arm();
			});
			return () => {
				off();
				attached = false;
				void flushNow();
			};
		},
		async export(input) {
			try {
				const count = await options.sendExport(input);
				sent += count;
				return { ok: true, sent: count };
			} catch (error) {
				fail('export', error);
				return { ok: false, error: messageOf(error) };
			}
		},
		flush: flushNow,
		status: () => ({
			attached,
			buffered: buffer.length,
			sent,
			failed,
			...(lastError !== undefined ? { lastError } : {})
		})
	};
}
