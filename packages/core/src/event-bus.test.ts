import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from './event-bus.js';
import type { EngineEvent } from './schemas/events.js';

function runStarted(overrides: Partial<EngineEvent> = {}): EngineEvent {
	return {
		id: '33333333-3333-4333-8333-333333333333',
		runId: '22222222-2222-4222-8222-222222222222',
		tick: 0,
		timestamp: '2026-08-12T10:00:00Z',
		type: 'run.started',
		payload: { mode: 'step' },
		...overrides
	} as EngineEvent;
}

function tickStarted(): EngineEvent {
	return {
		id: '55555555-5555-4555-8555-555555555555',
		runId: '22222222-2222-4222-8222-222222222222',
		tick: 1,
		timestamp: '2026-08-12T10:00:01Z',
		type: 'tick.started',
		payload: {}
	};
}

describe('EventBus', () => {
	it('delivers an event only to listeners subscribed to its type', () => {
		const bus = createEventBus();
		const runListener = vi.fn();
		const tickListener = vi.fn();
		bus.on('run.started', runListener);
		bus.on('tick.started', tickListener);

		bus.emit(runStarted());

		expect(runListener).toHaveBeenCalledTimes(1);
		expect(tickListener).not.toHaveBeenCalled();
	});

	it('narrows the listener payload to the subscribed type', () => {
		const bus = createEventBus();
		let observedMode: string | undefined;
		bus.on('run.started', (event) => {
			observedMode = event.payload.mode;
		});

		bus.emit(runStarted());

		expect(observedMode).toBe('step');
	});

	it('delivers every event to onAny listeners', () => {
		const bus = createEventBus();
		const seen: string[] = [];
		bus.onAny((event) => seen.push(event.type));

		bus.emit(runStarted());
		bus.emit(tickStarted());

		expect(seen).toEqual(['run.started', 'tick.started']);
	});

	it('stops calling a listener after it unsubscribes', () => {
		const bus = createEventBus();
		const listener = vi.fn();
		const unsubscribe = bus.on('run.started', listener);

		bus.emit(runStarted());
		unsubscribe();
		bus.emit(runStarted());

		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('supports multiple independent listeners on the same type', () => {
		const bus = createEventBus();
		const first = vi.fn();
		const second = vi.fn();
		bus.on('run.started', first);
		bus.on('run.started', second);

		bus.emit(runStarted());

		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
	});

	it('is safe when a listener unsubscribes itself mid-emit', () => {
		const bus = createEventBus();
		const other = vi.fn();
		const unsubscribe = bus.on('run.started', () => unsubscribe());
		bus.on('run.started', other);

		expect(() => bus.emit(runStarted())).not.toThrow();
		expect(other).toHaveBeenCalledTimes(1);

		other.mockClear();
		bus.emit(runStarted());
		expect(other).toHaveBeenCalledTimes(1);
	});

	it('still calls every other listener when one throws, then surfaces the failure', () => {
		const bus = createEventBus();
		const broken = vi.fn(() => {
			throw new Error('listener boom');
		});
		const healthy = vi.fn();
		bus.on('run.started', broken);
		bus.on('run.started', healthy);

		expect(() => bus.emit(runStarted())).toThrow(AggregateError);
		expect(broken).toHaveBeenCalledTimes(1);
		expect(healthy).toHaveBeenCalledTimes(1);
	});

	it('aggregates errors from both typed and onAny listeners', () => {
		const bus = createEventBus();
		bus.on('run.started', () => {
			throw new Error('typed boom');
		});
		bus.onAny(() => {
			throw new Error('any boom');
		});

		try {
			bus.emit(runStarted());
			expect.unreachable('emit should have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(AggregateError);
			expect((error as AggregateError).errors).toHaveLength(2);
		}
	});

	it('does nothing when a type has no listeners', () => {
		const bus = createEventBus();
		expect(() => bus.emit(runStarted())).not.toThrow();
	});
});
