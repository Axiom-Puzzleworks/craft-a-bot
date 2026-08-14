import type { EngineEvent } from '@craftabot/core';
import type { Storage } from './storage.js';

/**
 * The Flight Recorder's writing end: takes a run's events and persists them, in
 * order, as they happen.
 *
 * Events are buffered and flushed rather than written one at a time: a tick can
 * emit a dozen events (every streamed token is one), and a write per event
 * would put IndexedDB in the critical path of the loop. Ordering is preserved
 * because `appendEvents` assigns `seq` from the count already stored.
 *
 * **Events are pushed in rather than subscribed to.** This module used to take
 * an `AgentSession` and attach to its bus, which is why it went two work
 * packages without a caller: the only place that wants it is the play route,
 * and the route holds a `SessionView`, not a session. Reaching through the view
 * for the bus would have put engine internals in a Svelte component — hard rule
 * 1 — so the recorder now accepts what the view already hands out.
 */

export interface TraceRecorder {
	/** Take one event. Cheap; writes happen in batches. */
	accept(event: EngineEvent): void;
	/** Persist anything buffered. Safe to call at any time. */
	flush(): Promise<void>;
	/** Flush and refuse anything further. */
	stop(): Promise<void>;
	/** Events seen so far this run, in order — the in-memory mirror the UI reads. */
	events(): EngineEvent[];
}

export interface RecordOptions {
	/** Flush once this many events are buffered. */
	batchSize?: number;
}

export function recordTrace(
	runId: string,
	storage: Storage,
	options: RecordOptions = {}
): TraceRecorder {
	const batchSize = options.batchSize ?? 25;
	const seen: EngineEvent[] = [];
	let buffer: EngineEvent[] = [];
	let writing: Promise<void> = Promise.resolve();
	let stopped = false;

	function queueFlush(): Promise<void> {
		const batch = buffer;
		buffer = [];
		if (batch.length === 0) return writing;
		// Chained rather than concurrent: two overlapping appends would both read
		// the same starting `seq` and collide.
		writing = writing.then(() => storage.appendEvents(runId, batch));
		return writing;
	}

	return {
		accept(event) {
			if (stopped) return;
			seen.push(event);
			buffer.push(event);
			if (buffer.length >= batchSize) void queueFlush();
			/*
			 * A finished turn is always worth a write, whatever the buffer holds.
			 *
			 * Batching alone made the buffer the thing that loses runs: a tick emits
			 * well under `batchSize` events, so a child who shut the tab two turns
			 * in had a stored run with an empty story — which is most of what
			 * `16-…` §1.4 is trying to prevent. Flushing per turn bounds the loss
			 * at the turn in flight, and a turn is the unit the Scrapbook and the
			 * story strip deal in anyway, so a partial trace never ends mid-thought.
			 */
			if (event.type === 'tick.completed' || event.type === 'run.finished') void queueFlush();
		},
		flush: () => queueFlush(),
		async stop() {
			stopped = true;
			await queueFlush();
		},
		events: () => [...seen]
	};
}
