import { describe, expect, it } from 'vitest';
import { createEventBus, type EngineEvent, type RunRecord, type TraceSink } from '@craftabot/core';
import { makeGroupRun, makeRun } from '@craftabot/core/testing';
import { checkSink, describeSinkConformance } from '@craftabot/pack-testkit';
import { createBatcher } from './batch.js';
import { otelTraceFor, otelTraceForExport, otelTraceForGroup } from './otel.js';
import { otlpHttpSink, tracesEndpoint } from './otlp-http.js';

const at = (tick: number, type: string, payload: unknown, runId = 'r'): EngineEvent =>
	({
		id: `e${tick}-${type}`,
		runId,
		tick,
		timestamp: '2026-09-02T10:00:00.000Z',
		type,
		payload
	}) as unknown as EngineEvent;

const trip = (tick: number, runId?: string) =>
	at(
		tick,
		'guardrail.tripped',
		{ guardrailId: 'safety/x', hook: 'pre-act', reason: 'no', disposition: 'block-action' },
		runId
	);
const thought = (tick: number, runId?: string) =>
	at(
		tick,
		'think.completed',
		{
			response: {
				text: 'hi',
				raw: {},
				finishReason: 'stop',
				usage: { inputTokens: 3, outputTokens: 2 }
			}
		},
		runId
	);

function run(overrides: Partial<RunRecord> = {}): RunRecord {
	return makeRun(overrides);
}

describe('otelTraceForGroup (WP47)', () => {
	it('is one trace: an invoke_group root, one invoke_agent per member beneath it, their children beneath those', () => {
		const group = makeGroupRun();
		const [aId, bId] = group.memberRunIds as [string, string];
		const a = run({ id: aId, agentName: 'Robo' });
		const b = run({ id: bId, agentName: 'Bolt' });
		const trace = otelTraceForGroup({
			record: group,
			events: [],
			members: [
				{ run: a, events: [thought(1, a.id), trip(1, a.id)] },
				{ run: b, events: [thought(1, b.id)] }
			]
		});
		const spans = trace.resourceSpans[0].scopeSpans[0].spans;
		expect(spans.map((span) => span.name)).toEqual([
			`invoke_group ${group.goalCardId}`,
			'invoke_agent Robo',
			'chat',
			'invoke_agent Bolt',
			'chat'
		]);
		const root = spans[0];
		expect(new Set(spans.map((span) => span.traceId)).size).toBe(1);
		expect(spans[1]?.parentSpanId).toBe(root?.spanId);
		expect(spans[3]?.parentSpanId).toBe(root?.spanId);
		expect(spans[2]?.parentSpanId).toBe(spans[1]?.spanId);
		expect(spans[1]?.events?.[0]?.name).toBe('gen_ai.evaluation.result');
		expect(root?.attributes).toContainEqual({
			key: 'craft_a_bot.group.members',
			value: { intValue: '2' }
		});
	});

	it('otelTraceForExport picks the group when there is one', () => {
		const solo = run();
		expect(otelTraceForExport({ run: solo, events: [] })).toEqual(otelTraceFor(solo, []));
		const group = makeGroupRun();
		const exported = otelTraceForExport({
			run: solo,
			events: [],
			group: { record: group, events: [], members: [] }
		});
		expect(exported.resourceSpans[0].scopeSpans[0].spans[0]?.name).toContain('invoke_group');
	});
});

describe('createBatcher', () => {
	function batcher(send: (events: readonly EngineEvent[]) => Promise<number>, batchSize = 3) {
		const timers: Array<() => void> = [];
		const errors: string[] = [];
		const b = createBatcher({
			sinkId: 'test/sink',
			batchSize,
			flushAfterMs: 100,
			send,
			sendExport: () => Promise.resolve(1),
			onError: (error) => errors.push(error.message),
			schedule: (callback) => {
				timers.push(callback);
				return () => {
					const index = timers.indexOf(callback);
					if (index !== -1) timers.splice(index, 1);
				};
			}
		});
		return { b, timers, errors, fire: () => timers.splice(0).forEach((t) => t()) };
	}

	it('flushes when the buffer fills, when the run finishes, and when the quiet timer fires', async () => {
		const batches: number[] = [];
		const { b, fire } = batcher((events) => {
			batches.push(events.length);
			return Promise.resolve(events.length);
		});
		const bus = createEventBus();
		const off = b.attach(bus, { runId: 'r', agentId: 'a' });
		expect(b.status()).toMatchObject({ attached: true, buffered: 0, sent: 0, failed: 0 });
		bus.emit(thought(1));
		bus.emit(thought(2));
		bus.emit(thought(3));
		await b.flush();
		expect(batches).toEqual([3]);
		bus.emit(thought(4));
		expect(b.status().buffered).toBe(1);
		fire();
		await b.flush();
		expect(batches).toEqual([3, 1]);
		bus.emit(at(5, 'run.finished', { outcome: 'SUCCESS' }));
		await b.flush();
		expect(batches).toEqual([3, 1, 1]);
		off();
		expect(b.status()).toMatchObject({ attached: false, sent: 5 });
	});

	it('a send that rejects is counted, told, and never thrown; a later flush still goes', async () => {
		let calls = 0;
		const { b, errors } = batcher(() => {
			calls += 1;
			return calls === 1 ? Promise.reject(new Error('collector down')) : Promise.resolve(1);
		}, 1);
		const bus = createEventBus();
		b.attach(bus, { runId: 'r', agentId: 'a' });
		bus.emit(thought(1));
		await b.flush();
		expect(b.status()).toMatchObject({ failed: 1, lastError: 'collector down', sent: 0 });
		expect(errors).toEqual(['collector down']);
		bus.emit(thought(2));
		await b.flush();
		expect(b.status()).toMatchObject({ failed: 1, sent: 1 });
	});

	it('export resolves { ok: false } on a rejection and { ok: true, sent } otherwise', async () => {
		const failing = createBatcher({
			sinkId: 's',
			batchSize: 1,
			flushAfterMs: 100,
			send: () => Promise.resolve(0),
			sendExport: () => Promise.reject(new Error('nope'))
		});
		expect(await failing.export({ run: run(), events: [] })).toEqual({ ok: false, error: 'nope' });
		expect(failing.status().failed).toBe(1);
		const { b } = batcher(() => Promise.resolve(0));
		expect(await b.export({ run: run(), events: [] })).toEqual({ ok: true, sent: 1 });
		// A flush with nothing buffered, or before attach, is a no-op.
		await b.flush();
	});
});

describe('telemetry/otlp-http', () => {
	function collector(status = 200) {
		const bodies: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
		const fetchImpl: typeof fetch = (input, init) => {
			const headers: Record<string, string> = {};
			new Headers(init?.headers).forEach((value, key) => (headers[key] = value));
			bodies.push({ url: String(input), headers, body: JSON.parse(String(init?.body)) });
			return Promise.resolve(new Response('{}', { status }));
		};
		return { bodies, fetchImpl };
	}

	it('exports a stored run as one OTLP/HTTP request with the bearer token, to /v1/traces', async () => {
		const { bodies, fetchImpl } = collector();
		const sink = otlpHttpSink.create({
			config: { url: 'http://localhost:4318/' },
			fetch: fetchImpl,
			getCredential: () => 'tok-123'
		});
		const stored = run();
		const result = await sink.export({ run: stored, events: [thought(1), trip(1)] });
		expect(result).toEqual({ ok: true, sent: 2 });
		expect(bodies[0]?.url).toBe('http://localhost:4318/v1/traces');
		expect(bodies[0]?.headers['authorization']).toBe('Bearer tok-123');
		expect(bodies[0]?.body).toEqual(otelTraceFor(stored, [thought(1), trip(1)]));
		expect(tracesEndpoint('http://c:4318')).toBe('http://c:4318/v1/traces');
	});

	it('streams a live run in batches on one trace id and finishes on run.finished', async () => {
		const { bodies, fetchImpl } = collector();
		const sink = otlpHttpSink.create({
			config: { url: 'http://localhost:4318', batchSize: 2, flushAfterMs: 50 },
			fetch: fetchImpl,
			getCredential: () => undefined
		});
		const bus = createEventBus();
		sink.attach(bus, { runId: run().id, agentId: run().agentId });
		bus.emit(
			at(0, 'run.started', {
				spec: { name: 'Snackbot', goalCardId: 'starter/say-hello' },
				providerId: 'mock',
				wireModel: 'mock-1'
			})
		);
		bus.emit(thought(1));
		await sink.flush();
		bus.emit(thought(2));
		bus.emit(at(2, 'run.finished', { outcome: 'SUCCESS' }));
		await sink.flush();
		expect(bodies).toHaveLength(2);
		const traceIds = bodies.map(
			(b) =>
				(b.body as { resourceSpans: [{ scopeSpans: [{ spans: { traceId: string }[] }] }] })
					.resourceSpans[0].scopeSpans[0].spans[0]?.traceId
		);
		expect(new Set(traceIds).size).toBe(1);
		expect(sink.status()).toMatchObject({ failed: 0 });
		expect(bodies[0]?.headers['authorization']).toBeUndefined();
	});

	it('a collector that answers 500 is a counted failure, and a batch with nothing to map sends nothing', async () => {
		const { bodies, fetchImpl } = collector(500);
		const sink = otlpHttpSink.create({
			config: { url: 'http://localhost:4318' },
			fetch: fetchImpl,
			getCredential: () => undefined
		});
		expect(await sink.export({ run: run(), events: [] })).toMatchObject({ ok: false });
		expect(sink.status()).toMatchObject({ failed: 1, lastError: 'collector answered 500' });
		const bus = createEventBus();
		sink.attach(bus, { runId: 'r', agentId: 'a' });
		bus.emit(at(1, 'sense', { channels: [], observation: { channels: [], text: 'x' } }));
		await sink.flush();
		expect(bodies).toHaveLength(1);
	});

	it('declares the collector host as its egress, and nothing for a config it cannot read', () => {
		expect(otlpHttpSink.egress({ url: 'https://otel.example.com:4318/' })).toEqual([
			{ host: 'otel.example.com', purpose: 'trace export', sends: ['trace'] }
		]);
		expect(otlpHttpSink.egress({ url: 'not a url' })).toEqual([]);
	});

	it('checkSink rejects a sink that throws from attach', async () => {
		const broken: TraceSink = {
			...otlpHttpSink,
			id: 'test/broken',
			create: () => ({
				attach: () => {
					throw new Error('cannot attach');
				},
				export: () => Promise.resolve({ ok: false, error: 'no' }),
				flush: () => Promise.resolve(),
				status: () => ({ attached: false, buffered: 0, sent: 0, failed: 1 })
			})
		};
		const issues = await checkSink(broken, {
			config: { url: 'http://localhost:4318' },
			input: { run: run(), events: [thought(1)] },
			plantedSecret: 'planted'
		});
		expect(issues.map((issue) => issue.check)).toContain('sink.attach');
	});
});

describeSinkConformance(otlpHttpSink, {
	config: { url: 'http://localhost:4318' },
	input: { run: makeRun(), events: [thought(1), trip(1)] },
	plantedSecret: 'planted-secret-that-nothing-should-carry'
});
