import type { EngineEvent, RunRecord } from '@craftabot/core';

/**
 * **OTel-mapped export** (`19-…` #20, WP34 stage D) — one stored run, shaped
 * as OTLP JSON against the OpenTelemetry GenAI semantic conventions
 * (`19-…` §5.1). Best-effort, not spec-conformant: the conventions are
 * still Development/experimental, moved to their own repo with no stable
 * release, and this maps only what has a genuine, non-invented
 * correspondence rather than chasing every attribute the spec names.
 *
 * The mapping: the whole run is one root `invoke_agent` span; each
 * `think.completed` becomes a child `chat` span carrying
 * `gen_ai.usage.input_tokens`/`output_tokens`; each `tool.executed` becomes
 * a child `execute_tool` span; each `guardrail.tripped` becomes a
 * `gen_ai.evaluation.result` **event** on the root span — §5.1's own doc
 * comment names this as "a natural home for guardrail verdicts", so this
 * is that, not an invention. Nothing else in the trace (memory, sense,
 * plain world actions) has an OTel GenAI equivalent, so nothing else is
 * forced into one.
 *
 * **Amended 2026-09-01 (WP35 stage B, `25-ARMOUR-BRICK.md` §4.7):** each
 * `guardrail.external` becomes a child span, kind CLIENT — a real network
 * call this run made, the same reason `chat`/`execute_tool` are spans and
 * not events. `evaluate_guardrail` is not a GenAI semconv span name (the
 * spec has none for a content-safety call); named to match `chat`'s and
 * `execute_tool`'s own verb_noun shape rather than invented ceremony. The
 * token and the screened text never reach this file — `guardrail.external`
 * itself never carries them (`02-…` §7's own amendment).
 *
 * ids: OTLP wants a 32-hex-char `traceId` and a 16-hex-char `spanId`. Every
 * id already in a trace is a UUID, which is 32 hex characters once its own
 * dashes are stripped — exactly a `traceId`'s shape — so ids are derived,
 * not invented, by stripping and (for spans) truncating.
 *
 * Durations: the engine does not record a start/end pair for a single tick
 * event, only the moment it happened. Rather than fabricate a duration,
 * every span here is a zero-width point-in-time span (`start === end`),
 * which OTLP allows and which claims nothing this app cannot back up.
 */

interface OtelAttribute {
	key: string;
	value: { stringValue: string } | { intValue: string };
}

interface OtelSpanEvent {
	timeUnixNano: string;
	name: string;
	attributes: OtelAttribute[];
}

interface OtelSpan {
	traceId: string;
	spanId: string;
	parentSpanId?: string;
	name: string;
	/** OTLP `SpanKind`: 2 = SERVER (the run, entered from outside), 3 = CLIENT (a call this run made). */
	kind: 2 | 3;
	startTimeUnixNano: string;
	endTimeUnixNano: string;
	attributes: OtelAttribute[];
	events?: OtelSpanEvent[];
}

export interface OtelTrace {
	resourceSpans: [
		{
			resource: { attributes: OtelAttribute[] };
			scopeSpans: [{ scope: { name: string; version: string }; spans: OtelSpan[] }];
		}
	];
}

function stringAttr(key: string, value: string): OtelAttribute {
	return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): OtelAttribute {
	return { key, value: { intValue: String(Math.trunc(value)) } };
}

const hex = (id: string): string => id.replace(/-/g, '');
const traceIdOf = (runId: string): string => hex(runId).padEnd(32, '0').slice(0, 32);
const spanIdOf = (id: string): string => hex(id).padEnd(16, '0').slice(0, 16);
const nanosOf = (iso: string): string => String(BigInt(Date.parse(iso)) * 1_000_000n);

/** One stored run's trace, shaped as OTLP JSON. */
export function otelTraceFor(run: RunRecord, events: readonly EngineEvent[]): OtelTrace {
	const traceId = traceIdOf(run.id);
	const rootSpanId = spanIdOf(run.id);
	const rootEvents: OtelSpanEvent[] = [];
	const childSpans: OtelSpan[] = [];

	for (const event of events) {
		if (event.type === 'think.completed') {
			const at = nanosOf(event.timestamp);
			childSpans.push({
				traceId,
				spanId: spanIdOf(event.id),
				parentSpanId: rootSpanId,
				name: 'chat',
				kind: 3,
				startTimeUnixNano: at,
				endTimeUnixNano: at,
				attributes: [
					stringAttr('gen_ai.operation.name', 'chat'),
					intAttr('gen_ai.usage.input_tokens', event.payload.response.usage.inputTokens),
					intAttr('gen_ai.usage.output_tokens', event.payload.response.usage.outputTokens),
					intAttr('craft_a_bot.tick', event.tick)
				]
			});
		} else if (event.type === 'tool.executed') {
			const at = nanosOf(event.timestamp);
			childSpans.push({
				traceId,
				spanId: spanIdOf(event.id),
				parentSpanId: rootSpanId,
				name: 'execute_tool',
				kind: 3,
				startTimeUnixNano: at,
				endTimeUnixNano: at,
				attributes: [
					stringAttr('gen_ai.operation.name', 'execute_tool'),
					stringAttr('gen_ai.tool.name', event.payload.name),
					intAttr('craft_a_bot.tick', event.tick)
				]
			});
		} else if (event.type === 'guardrail.external') {
			const at = nanosOf(event.timestamp);
			childSpans.push({
				traceId,
				spanId: spanIdOf(event.id),
				parentSpanId: rootSpanId,
				name: 'evaluate_guardrail',
				kind: 3,
				startTimeUnixNano: at,
				endTimeUnixNano: at,
				attributes: [
					stringAttr('gen_ai.operation.name', 'evaluate_guardrail'),
					stringAttr('gen_ai.evaluation.name', event.payload.guardrailId),
					stringAttr('craft_a_bot.guardrail.service', event.payload.service),
					stringAttr('craft_a_bot.guardrail.endpoint', event.payload.endpoint),
					stringAttr('craft_a_bot.guardrail.template', event.payload.template),
					stringAttr('craft_a_bot.guardrail.outcome', event.payload.outcome),
					intAttr('craft_a_bot.guardrail.latency_ms', event.payload.latencyMs),
					intAttr('craft_a_bot.guardrail.chars_screened', event.payload.charsScreened),
					intAttr('craft_a_bot.tick', event.tick)
				]
			});
		} else if (event.type === 'guardrail.tripped') {
			rootEvents.push({
				timeUnixNano: nanosOf(event.timestamp),
				name: 'gen_ai.evaluation.result',
				attributes: [
					stringAttr('gen_ai.evaluation.name', event.payload.guardrailId),
					stringAttr('gen_ai.evaluation.result.label', 'blocked'),
					stringAttr('gen_ai.evaluation.explanation', event.payload.reason),
					intAttr('craft_a_bot.tick', event.tick)
				]
			});
		}
	}

	const rootSpan: OtelSpan = {
		traceId,
		spanId: rootSpanId,
		name: `invoke_agent ${run.agentName}`,
		kind: 2,
		startTimeUnixNano: nanosOf(run.startedAt),
		endTimeUnixNano: nanosOf(run.finishedAt ?? run.startedAt),
		attributes: [
			stringAttr('gen_ai.operation.name', 'invoke_agent'),
			stringAttr('gen_ai.agent.name', run.agentName),
			stringAttr('gen_ai.provider.name', run.providerId),
			stringAttr('gen_ai.request.model', run.wireModel),
			stringAttr('craft_a_bot.goal_card_id', run.goalCardId),
			stringAttr('craft_a_bot.outcome', run.outcome),
			intAttr('craft_a_bot.ticks', run.ticks),
			intAttr('gen_ai.usage.input_tokens', run.usage.inputTokens),
			intAttr('gen_ai.usage.output_tokens', run.usage.outputTokens)
		],
		...(rootEvents.length > 0 ? { events: rootEvents } : {})
	};

	return {
		resourceSpans: [
			{
				resource: { attributes: [stringAttr('service.name', 'craft-a-bot')] },
				scopeSpans: [
					{ scope: { name: 'craft-a-bot', version: '1' }, spans: [rootSpan, ...childSpans] }
				]
			}
		]
	};
}
