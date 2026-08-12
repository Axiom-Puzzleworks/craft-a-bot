import type { AgentSession, EngineEvent } from '@craftabot/core';
import type { Storage } from './storage.js';

/**
 * The Flight Recorder's writing end. Subscribes to a session's EventBus and
 * persists everything it hears, in order.
 *
 * Events are buffered and flushed rather than written one at a time: a tick can
 * emit a dozen events (every streamed token is one), and a write per event
 * would put IndexedDB in the critical path of the loop. Ordering is preserved
 * because `appendEvents` assigns `seq` from the count already stored.
 */

export interface TraceRecorder {
	/** Persist anything buffered. Safe to call at any time. */
	flush(): Promise<void>;
	/** Flush and unsubscribe. */
	stop(): Promise<void>;
	/** Events seen so far this run, in order — the in-memory mirror the UI reads. */
	events(): EngineEvent[];
}

export interface RecordOptions {
	/** Flush once this many events are buffered. */
	batchSize?: number;
}

export function recordTrace(
	session: AgentSession,
	runId: string,
	storage: Storage,
	options: RecordOptions = {}
): TraceRecorder {
	const batchSize = options.batchSize ?? 25;
	const seen: EngineEvent[] = [];
	let buffer: EngineEvent[] = [];
	let writing: Promise<void> = Promise.resolve();

	function queueFlush(): Promise<void> {
		const batch = buffer;
		buffer = [];
		if (batch.length === 0) return writing;
		// Chained rather than concurrent: two overlapping appends would both read
		// the same starting `seq` and collide.
		writing = writing.then(() => storage.appendEvents(runId, batch));
		return writing;
	}

	const unsubscribe = session.events.onAny((event) => {
		seen.push(event);
		buffer.push(event);
		if (buffer.length >= batchSize) void queueFlush();
		// The end of a run is always worth a write, whatever the buffer holds.
		if (event.type === 'run.finished') void queueFlush();
	});

	return {
		flush: () => queueFlush(),
		async stop() {
			unsubscribe();
			await queueFlush();
		},
		events: () => [...seen]
	};
}
