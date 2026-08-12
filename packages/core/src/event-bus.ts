import type { EngineEvent, EventType } from './schemas/events.js';

/**
 * The observability spine (02-AGENT-MODEL.md §7): UI panels, the trace
 * recorder, and guardrails all subscribe to the same typed event stream
 * (01-ARCHITECTURE.md §3). Adding an observer never touches engine code.
 */
export type EventListener<T extends EventType> = (event: Extract<EngineEvent, { type: T }>) => void;
export type AnyEventListener = (event: EngineEvent) => void;
export type Unsubscribe = () => void;

export interface EventBus {
	/** Subscribe to one event type; the callback narrows to that type's payload. */
	on<T extends EventType>(type: T, listener: EventListener<T>): Unsubscribe;
	/** Subscribe to every event — what the trace recorder uses. */
	onAny(listener: AnyEventListener): Unsubscribe;
	/**
	 * Publish an event to every matching listener. If any listener throws, the
	 * rest still run (one broken observer must not blind the others to a real
	 * engine occurrence) — but the failure is never swallowed: it surfaces as
	 * an `AggregateError` once every listener has had its turn.
	 */
	emit(event: EngineEvent): void;
}

export function createEventBus(): EventBus {
	const listenersByType = new Map<EventType, Set<AnyEventListener>>();
	const anyListeners = new Set<AnyEventListener>();

	function on<T extends EventType>(type: T, listener: EventListener<T>): Unsubscribe {
		let listeners = listenersByType.get(type);
		if (!listeners) {
			listeners = new Set();
			listenersByType.set(type, listeners);
		}
		const wrapped = listener as AnyEventListener;
		listeners.add(wrapped);
		return () => listeners.delete(wrapped);
	}

	function onAny(listener: AnyEventListener): Unsubscribe {
		anyListeners.add(listener);
		return () => anyListeners.delete(listener);
	}

	function emit(event: EngineEvent): void {
		const errors: unknown[] = [];
		const typed = listenersByType.get(event.type);
		for (const listener of typed ? [...typed] : []) {
			try {
				listener(event);
			} catch (error) {
				errors.push(error);
			}
		}
		for (const listener of [...anyListeners]) {
			try {
				listener(event);
			} catch (error) {
				errors.push(error);
			}
		}
		if (errors.length > 0) {
			throw new AggregateError(
				errors,
				`${errors.length} event listener(s) threw while handling "${event.type}"`
			);
		}
	}

	return { on, onAny, emit };
}
