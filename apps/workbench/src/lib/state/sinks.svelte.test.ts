import { createEventBus, type EngineEvent } from '@craftabot/core';
import { makeRun } from '@craftabot/core/testing';
import { otlpHttpSink } from '@craftabot/telemetry';
import { describe, expect, it } from 'vitest';
import { SINKS_STORAGE_KEY, createSinksStore } from './sinks.svelte.js';

function memoryStorage() {
	const map = new Map<string, string>();
	return {
		getItem: (key: string) => map.get(key) ?? null,
		setItem: (key: string, value: string) => void map.set(key, value),
		dump: () => Object.fromEntries(map)
	};
}

function collector(status = 200) {
	const calls: string[] = [];
	const fetchImpl: typeof fetch = (input) => {
		calls.push(String(input));
		return Promise.resolve(new Response('{}', { status }));
	};
	return { calls, fetchImpl };
}

describe('the sinks store (WP47)', () => {
	it('persists configurations, lists the available sinks, and builds only enabled valid ones', () => {
		const storage = memoryStorage();
		const store = createSinksStore({ storage, fetch: collector().fetchImpl });
		expect(store.available.map((sink) => sink.id)).toEqual(['telemetry/otlp-http']);
		store.set({
			sinkId: 'telemetry/otlp-http',
			config: { url: 'http://localhost:4318' },
			enabled: false
		});
		expect(JSON.parse(storage.dump()[SINKS_STORAGE_KEY] ?? '{}').sinks).toHaveLength(1);
		expect(store.instances()).toEqual([]);
		store.set({
			sinkId: 'telemetry/otlp-http',
			config: { url: 'http://localhost:4318' },
			enabled: true
		});
		expect(store.instances().map((entry) => entry.sink.id)).toEqual(['telemetry/otlp-http']);
		store.set({ sinkId: 'telemetry/otlp-http', config: { nope: true }, enabled: true });
		expect(store.instances()).toEqual([]);
		store.remove('telemetry/otlp-http');
		expect(store.configurations).toEqual([]);
		// A second store reads what the first wrote.
		store.set({
			sinkId: 'telemetry/otlp-http',
			config: { url: 'http://localhost:4318' },
			enabled: true
		});
		expect(createSinksStore({ storage }).configurations).toHaveLength(1);
		expect(
			createSinksStore({ storage: { getItem: () => 'not json', setItem: () => undefined } })
				.configurations
		).toEqual([]);
	});

	it('sends a stored run through the egress guard: the configured host is allowed, another is refused on the sink', async () => {
		const allowed = collector();
		const store = createSinksStore({ storage: memoryStorage(), fetch: allowed.fetchImpl });
		store.set({
			sinkId: 'telemetry/otlp-http',
			config: { url: 'http://localhost:4318' },
			enabled: true
		});
		const result = await store.send('telemetry/otlp-http', { run: makeRun(), events: [] });
		expect(result).toEqual({ ok: true, sent: 1 });
		expect(allowed.calls).toEqual(['http://localhost:4318/v1/traces']);
		expect(store.statuses['telemetry/otlp-http']).toMatchObject({ sent: 1, failed: 0 });
		expect(await store.send('vendor/nope', { run: makeRun(), events: [] })).toEqual({
			ok: false,
			error: 'that sink is not configured'
		});
	});

	it('attaches every enabled sink to a live bus and reports the failure of a dead collector on the sink', async () => {
		const dead = collector(500);
		const store = createSinksStore({
			storage: memoryStorage(),
			fetch: dead.fetchImpl,
			sinks: [otlpHttpSink]
		});
		store.set({
			sinkId: 'telemetry/otlp-http',
			config: { url: 'http://localhost:4318', batchSize: 1 },
			enabled: true
		});
		const bus = createEventBus();
		const detach = store.attach(bus, { agentId: 'a' });
		bus.emit({
			id: 'e1',
			runId: 'r',
			tick: 1,
			timestamp: '2026-09-02T00:00:00.000Z',
			type: 'think.completed',
			payload: {
				response: {
					text: 'hi',
					raw: {},
					finishReason: 'stop',
					usage: { inputTokens: 1, outputTokens: 1 }
				}
			}
		} as unknown as EngineEvent);
		detach();
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(store.statuses['telemetry/otlp-http']).toMatchObject({ failed: 1, attached: false });
		expect(store.statuses['telemetry/otlp-http']?.lastError).toContain('500');
	});
});
