import { describe, expect, it } from 'vitest';
import type { EngineEvent, RunRecord } from '@craftabot/core';
import { otelTraceFor } from './otel-export.js';

let seq = 0;
const run = (over: Partial<RunRecord> = {}): RunRecord =>
	({
		id: '11111111-1111-4111-8111-111111111111',
		agentId: 'agent-1',
		agentName: 'Bolt',
		goalCardId: 'starter/snack',
		outcome: 'SUCCESS',
		ticks: 3,
		usage: { inputTokens: 300, outputTokens: 120 },
		providerId: 'demo',
		wireModel: 'demo-brain',
		startedAt: '2026-08-21T09:00:00.000Z',
		finishedAt: '2026-08-21T09:00:05.000Z',
		...over
	}) as never as RunRecord;

function event<T extends EngineEvent['type']>(type: T, payload: unknown, tick = 1): EngineEvent {
	seq += 1;
	return {
		id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
		runId: '11111111-1111-4111-8111-111111111111',
		agentId: '22222222-2222-4222-8222-222222222222',
		tick,
		timestamp: '2026-08-21T09:00:01.000Z',
		type,
		payload
	} as EngineEvent;
}

describe('otelTraceFor', () => {
	it("builds one root invoke_agent span carrying the run's own identity", () => {
		const trace = otelTraceFor(run(), []);
		const spans = trace.resourceSpans[0].scopeSpans[0].spans;
		expect(spans).toHaveLength(1);
		expect(spans[0]).toMatchObject({ name: 'invoke_agent Bolt', kind: 2 });
		expect(spans[0]?.attributes).toContainEqual({
			key: 'gen_ai.agent.name',
			value: { stringValue: 'Bolt' }
		});
		expect(spans[0]?.attributes).toContainEqual({
			key: 'craft_a_bot.outcome',
			value: { stringValue: 'SUCCESS' }
		});
	});

	it('derives a 32-hex traceId and 16-hex spanId from the real run/event ids', () => {
		const trace = otelTraceFor(run(), []);
		const root = trace.resourceSpans[0].scopeSpans[0].spans[0];
		expect(root?.traceId).toMatch(/^[0-9a-f]{32}$/);
		expect(root?.spanId).toMatch(/^[0-9a-f]{16}$/);
	});

	it('turns a think.completed into a child chat span carrying token usage', () => {
		const trace = otelTraceFor(run(), [
			event('think.completed', { response: { usage: { inputTokens: 50, outputTokens: 20 } } }, 2)
		]);
		const spans = trace.resourceSpans[0].scopeSpans[0].spans;
		const chat = spans.find((span) => span.name === 'chat');
		expect(chat).toBeDefined();
		expect(chat?.parentSpanId).toBe(spans[0]?.spanId);
		expect(chat?.attributes).toContainEqual({
			key: 'gen_ai.usage.input_tokens',
			value: { intValue: '50' }
		});
	});

	it('turns a tool.executed into a child execute_tool span', () => {
		const trace = otelTraceFor(run(), [
			event('tool.executed', { name: 'starter/calculator', arguments: {}, result: '39' }, 3)
		]);
		const tool = trace.resourceSpans[0].scopeSpans[0].spans.find(
			(span) => span.name === 'execute_tool'
		);
		expect(tool?.attributes).toContainEqual({
			key: 'gen_ai.tool.name',
			value: { stringValue: 'starter/calculator' }
		});
	});

	it('turns a guardrail.tripped into a gen_ai.evaluation.result event on the root span', () => {
		const trace = otelTraceFor(run(), [
			event(
				'guardrail.tripped',
				{ guardrailId: 'safety/action-blocklist', hook: 'pre-act', reason: 'blocked move' },
				4
			)
		]);
		const root = trace.resourceSpans[0].scopeSpans[0].spans[0];
		expect(root?.events).toEqual([
			{
				timeUnixNano: expect.any(String),
				name: 'gen_ai.evaluation.result',
				attributes: expect.arrayContaining([
					{ key: 'gen_ai.evaluation.name', value: { stringValue: 'safety/action-blocklist' } },
					{ key: 'gen_ai.evaluation.explanation', value: { stringValue: 'blocked move' } }
				])
			}
		]);
	});

	it('turns a guardrail.external into a child evaluate_guardrail span, kind CLIENT', () => {
		const trace = otelTraceFor(run(), [
			event(
				'guardrail.external',
				{
					guardrailId: 'geap/armor:decision',
					hook: 'pre-act',
					service: 'model-armor',
					endpoint: 'https://modelarmor.europe-west2.rep.googleapis.com/v1/…:sanitizeModelResponse',
					template: 'cab-armour',
					latencyMs: 280,
					charsScreened: 42,
					outcome: 'ok'
				},
				4
			)
		]);
		const spans = trace.resourceSpans[0].scopeSpans[0].spans;
		const guard = spans.find((span) => span.name === 'evaluate_guardrail');
		expect(guard).toBeDefined();
		expect(guard?.kind).toBe(3);
		expect(guard?.parentSpanId).toBe(spans[0]?.spanId);
		expect(guard?.attributes).toContainEqual({
			key: 'gen_ai.evaluation.name',
			value: { stringValue: 'geap/armor:decision' }
		});
		expect(guard?.attributes).toContainEqual({
			key: 'craft_a_bot.guardrail.template',
			value: { stringValue: 'cab-armour' }
		});
		expect(guard?.attributes).toContainEqual({
			key: 'craft_a_bot.guardrail.latency_ms',
			value: { intValue: '280' }
		});
		expect(guard?.attributes).toContainEqual({
			key: 'craft_a_bot.guardrail.outcome',
			value: { stringValue: 'ok' }
		});
	});

	it('never puts the token or the screened text on the guardrail span, because guardrail.external never carries them', () => {
		const trace = otelTraceFor(run(), [
			event(
				'guardrail.external',
				{
					guardrailId: 'geap/armor:decision',
					hook: 'pre-act',
					service: 'model-armor',
					endpoint: 'https://modelarmor.europe-west2.rep.googleapis.com/v1/…:sanitizeModelResponse',
					template: 'cab-armour',
					latencyMs: 280,
					charsScreened: 42,
					outcome: 'ok'
				},
				4
			)
		]);
		expect(JSON.stringify(trace)).not.toContain('Bearer');
	});

	it('carries no events array at all when nothing tripped', () => {
		const trace = otelTraceFor(run(), [event('action.performed', { name: 'move' }, 1)]);
		expect(trace.resourceSpans[0].scopeSpans[0].spans[0]?.events).toBeUndefined();
	});

	it('never fabricates a duration — a run still in progress ends where it started', () => {
		const trace = otelTraceFor(run({ finishedAt: undefined }), []);
		const root = trace.resourceSpans[0].scopeSpans[0].spans[0];
		expect(root?.endTimeUnixNano).toBe(root?.startTimeUnixNano);
	});
});
