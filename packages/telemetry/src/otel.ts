import type { EngineEvent, Principal, RunRecord } from '@craftabot/core';
import type { TraceExport } from './types.js';

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

export interface OtelAttribute {
	key: string;
	value: { stringValue: string } | { intValue: string };
}

export interface OtelSpanEvent {
	timeUnixNano: string;
	name: string;
	attributes: OtelAttribute[];
}

export interface OtelSpan {
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

/** The group's own principal, from `group.started` (WP65). */
function groupPrincipal(events: readonly EngineEvent[]): Principal | undefined {
	const started = events.find((event) => event.type === 'group.started');
	return started?.type === 'group.started' ? started.payload.principal : undefined;
}

/** The chain rendered `kind:id`, innermost first, joined ` <- ` — `agent:bot-1 <- person:browser-1`. */
export function principalChain(principal: Principal): string {
	const parts: string[] = [];
	for (let at: Principal | undefined = principal; at; at = at.onBehalfOf)
		parts.push(`${at.kind}:${at.id}`);
	return parts.join(' <- ');
}

/**
 * The principal as attributes (WP65, `55-…` §4.3): the conventions have
 * `gen_ai.agent.id`; a person or service behind the run has none, so the
 * rest are `craft_a_bot.*`. None when the run named no principal.
 */
function principalAttrs(principal: Principal | undefined): OtelAttribute[] {
	if (!principal) return [];
	return [
		stringAttr('craft_a_bot.principal.kind', principal.kind),
		stringAttr('craft_a_bot.principal.id', principal.id),
		...(principal.name !== undefined
			? [stringAttr('craft_a_bot.principal.name', principal.name)]
			: []),
		stringAttr('craft_a_bot.principal.chain', principalChain(principal))
	];
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
	// The principal on the run (WP65, `55-…` §4.3): `run.started` says, when a host named one.
	const started = events.find((event) => event.type === 'run.started');
	const principal = started?.type === 'run.started' ? started.payload.principal : undefined;

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
					// Whose tool call this was (WP65): the agent, and the chain behind it when the run names one.
					stringAttr('gen_ai.agent.id', run.agentId),
					...principalAttrs(principal),
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
					// Optional since the record widened (WP39 stage A, `29-…` §4.1):
					// a vendor writes the reference words it has, none of the rest.
					...(event.payload.template !== undefined
						? [stringAttr('craft_a_bot.guardrail.template', event.payload.template)]
						: []),
					...(event.payload.policyRef !== undefined
						? [stringAttr('craft_a_bot.guardrail.policy_ref', event.payload.policyRef)]
						: []),
					...(event.payload.method !== undefined
						? [stringAttr('craft_a_bot.guardrail.method', event.payload.method)]
						: []),
					stringAttr('craft_a_bot.guardrail.outcome', event.payload.outcome),
					intAttr('craft_a_bot.guardrail.latency_ms', event.payload.latencyMs),
					intAttr('craft_a_bot.guardrail.chars_screened', event.payload.charsScreened),
					intAttr('craft_a_bot.tick', event.tick)
				]
			});
		} else if (event.type === 'stage.completed') {
			// The stage boundary (WP79, `69-…` §6): one child span per stage a bot did, closed when the stage completed.
			const at = nanosOf(event.timestamp);
			const opened = events.find(
				(candidate) =>
					candidate.type === 'stage.started' && candidate.payload.stageId === event.payload.stageId
			);
			childSpans.push({
				traceId,
				spanId: spanIdOf(event.id),
				parentSpanId: rootSpanId,
				name: `stage ${event.payload.stageId}`,
				kind: 3,
				startTimeUnixNano: opened ? nanosOf(opened.timestamp) : at,
				endTimeUnixNano: at,
				attributes: [
					stringAttr('craft_a_bot.workflow.run_id', event.payload.workflowRunId),
					stringAttr('craft_a_bot.stage.id', event.payload.stageId),
					stringAttr('craft_a_bot.stage.status', event.payload.status),
					intAttr('craft_a_bot.stage.guards_checked', event.payload.guards.checked),
					intAttr('craft_a_bot.stage.guards_tripped', event.payload.guards.tripped),
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
					// The component and the point (WP94), when a component compiled the guardrail.
					...(event.payload.componentId !== undefined
						? [stringAttr('craft_a_bot.guardrail.component', event.payload.componentId)]
						: []),
					...(event.payload.point !== undefined
						? [
								stringAttr(
									'craft_a_bot.guardrail.point',
									`${event.payload.point.kind}${event.payload.point.at ? `@${event.payload.point.at}` : ''}`
								)
							]
						: []),
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
			stringAttr('gen_ai.agent.id', run.agentId),
			stringAttr('gen_ai.agent.name', run.agentName),
			...principalAttrs(principal),
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

/**
 * **A group episode as one trace** (`35-…` §4.2, WP47): a root
 * `invoke_group` span over the episode, one `invoke_agent` span per member
 * beneath it, each member's own child spans beneath that — every span on
 * the group's trace id, so a collector shows the episode as one tree.
 */
export function otelTraceForGroup(group: NonNullable<TraceExport['group']>): OtelTrace {
	const traceId = traceIdOf(group.record.id);
	const rootSpanId = spanIdOf(group.record.id);
	const spans: OtelSpan[] = [
		{
			traceId,
			spanId: rootSpanId,
			name: `invoke_group ${group.record.goalCardId}`,
			kind: 2,
			startTimeUnixNano: nanosOf(group.record.startedAt),
			endTimeUnixNano: nanosOf(group.record.finishedAt ?? group.record.startedAt),
			attributes: [
				stringAttr('gen_ai.operation.name', 'invoke_group'),
				...principalAttrs(groupPrincipal(group.events)),
				stringAttr('craft_a_bot.goal_card_id', group.record.goalCardId),
				stringAttr('craft_a_bot.outcome', group.record.outcome),
				intAttr('craft_a_bot.group.members', group.members.length),
				intAttr('craft_a_bot.group.rounds', group.record.rounds),
				intAttr('gen_ai.usage.input_tokens', group.record.usage.inputTokens),
				intAttr('gen_ai.usage.output_tokens', group.record.usage.outputTokens)
			]
		}
	];
	for (const member of group.members) {
		const own = otelTraceFor(member.run, member.events);
		for (const span of own.resourceSpans[0].scopeSpans[0].spans) {
			spans.push({
				...span,
				traceId,
				// The member's root hangs off the episode; its children keep their parent.
				...(span.parentSpanId === undefined ? { parentSpanId: rootSpanId } : {})
			});
		}
	}
	return {
		resourceSpans: [
			{
				resource: { attributes: [stringAttr('service.name', 'craft-a-bot')] },
				scopeSpans: [{ scope: { name: 'craft-a-bot', version: '1' }, spans }]
			}
		]
	};
}

/** The trace for whatever was exported: the group's when there is one, the run's otherwise. */
export function otelTraceForExport(input: TraceExport): OtelTrace {
	return input.group ? otelTraceForGroup(input.group) : otelTraceFor(input.run, input.events);
}
