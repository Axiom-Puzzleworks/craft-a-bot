import { z } from 'zod';

/**
 * The event catalogue (02-AGENT-MODEL.md §7) — the observability spine.
 * Crosses a storage/export boundary (traces, 07-DATA-MODEL-PERSISTENCE.md),
 * so this schema is the type source for `EngineEvent` (10-CODING-STANDARDS.md §1).
 *
 * > **Amended 2026-08-13 (WP13, E5):** the payload shapes are no longer
 * > mirrored here. `RunOutcome`, `GuardrailVerdict`, `ChatResponse`,
 * > `Observation` and their neighbours come from `shared.ts`, which is now
 * > their only definition — the engine, the packs and this catalogue all infer
 * > from the same schema. Mirroring them by hand is exactly how
 * > `Observation.summary` went missing (`12-…` D3).
 */

import {
	actionResultSchema,
	chatMessageSchema,
	chatResponseSchema,
	guardrailHookSchema,
	guardrailVerdictSchema,
	observationSchema,
	proposedStepSchema,
	runOutcomeSchema,
	usageSchema
} from './shared.js';

/** Shared envelope (02-AGENT-MODEL.md §7) around one event type's payload. */
function eventSchema<Type extends string, Payload extends z.ZodTypeAny>(
	type: Type,
	payload: Payload
) {
	return z.object({
		id: z.string().uuid(),
		runId: z.string().uuid(),
		/**
		 * Which agent this happened to (E10, `14-…` §3).
		 *
		 * The spec's id, repeated on every event of a single-agent run — which
		 * looks redundant today and is the whole point: the envelope stops being
		 * the thing that has to change when a second bot arrives (`12-…` D9).
		 * Merging two agents' traces into one ordered group trace is then a sort,
		 * not a migration, which is how production tracing correlates spans
		 * (`19-…` §5.3).
		 *
		 * Optional so that every trace written before WP13 still parses; the
		 * v1→v2 migration fills it in from the run's own agent id.
		 */
		agentId: z.string().uuid().optional(),
		/**
		 * The run that spawned this one, when an agent was started by another
		 * (`14-…` §6). Nothing produces it yet; it exists so that when
		 * `SessionGroup` arrives the shape does not have to change again.
		 */
		parentRunId: z.string().uuid().optional(),
		tick: z.number().int().nonnegative(),
		timestamp: z.string().datetime(),
		type: z.literal(type),
		payload
	});
}

/**
 * The facts a run is judged against, recorded where it starts (E8, `14-…` §3).
 *
 * A governance artefact has to answer "under what limits, and with what
 * model?" and the trace could answer neither: the budgets actually in force
 * were nowhere, and the only model reference was a cartridge id, which is a
 * label on a box rather than the thing that answered (`12-…` D6).
 */
const runStartedEvent = eventSchema(
	'run.started',
	z.object({
		mode: z.enum(['step', 'play']),
		/** The limits actually in force, after the platform floor and the dial. */
		budgets: z.object({
			maxTicks: z.number().int().positive(),
			maxTokens: z.number().int().positive(),
			requestTimeoutMs: z.number().int().positive()
		}),
		/** Which provider answered — `openai`, `mock`, later others. */
		providerId: z.string(),
		/** The model id that went on the wire, not the cartridge's label. */
		wireModel: z.string(),
		cartridgeId: z.string()
	})
);
const runFinishedEvent = eventSchema(
	'run.finished',
	z.object({
		outcome: runOutcomeSchema,
		ticks: z.number().int().nonnegative(),
		usage: usageSchema,
		/**
		 * Why it ended, when the outcome alone does not say (E2). A goal met by
		 * the world's predicate and a goal declared finished by a person are
		 * both `SUCCESS`, and an audit wants to know which.
		 */
		reason: z.string().optional()
	})
);

/**
 * Something said to the bot from outside the world (E2, `14-…` §3).
 *
 * The counterpart to the Hearing sense, which could report messages but had no
 * way to receive one (`12-…` D2). Traced because untrusted input arriving from
 * outside the simulation is the first link in the injection chain (`19-…` §2),
 * and "who told it that?" is an audit question.
 */
const inputDeliveredEvent = eventSchema(
	'input.delivered',
	z.object({
		text: z.string(),
		/** False when the world has no ears at all, so the message went nowhere. */
		heard: z.boolean()
	})
);
const tickStartedEvent = eventSchema('tick.started', z.object({}));
const tickCompletedEvent = eventSchema(
	'tick.completed',
	z.object({ outcome: runOutcomeSchema.optional() })
);
const senseEvent = eventSchema(
	'sense',
	z.object({ channels: z.array(z.string()), observation: observationSchema })
);
const promptComposedEvent = eventSchema(
	'prompt.composed',
	z.object({
		messages: z.array(chatMessageSchema),
		estimatedTokens: z.number().int().nonnegative()
	})
);
const thinkStartedEvent = eventSchema(
	'think.started',
	z.object({
		/**
		 * > **Amended 2026-08-13 (WP13, E8):** `model` used to carry the
		 * > *cartridge* id, so a trace claiming to record which model was asked
		 * > actually recorded which box it came in (`12-…` D6). It now carries
		 * > all three, and the wire model is the one an auditor wants.
		 */
		wireModel: z.string(),
		providerId: z.string(),
		cartridgeId: z.string()
	})
);
const thinkTokenEvent = eventSchema('think.token', z.object({ delta: z.string() }));

/**
 * The provider asked us to wait, and we did (E11, `14-…` §3).
 *
 * `ProviderError.retryAfterMs` was parsed off the wire and then ignored, so a
 * rate limit ended the run outright (`12-…` D10) — a bot stopped mid-goal
 * because a server said "in two seconds, please". The wait is traced rather
 * than silent: a run that took nine seconds longer than its neighbours needs
 * to say why, and "the brain needed a breather" is a real thing to learn about
 * agents that call paid APIs.
 */
const providerRetriedEvent = eventSchema(
	'provider.retried',
	z.object({
		kind: z.string(),
		/** How long we waited, after clamping whatever the provider asked for. */
		afterMs: z.number().int().nonnegative(),
		/** Always 1 today: one retry, then the error stands. */
		attempt: z.number().int().positive()
	})
);
const thinkCompletedEvent = eventSchema(
	'think.completed',
	z.object({ response: chatResponseSchema })
);
const decisionEvent = eventSchema(
	'decision',
	z.object({
		thought: z.string(),
		call: z
			.object({ kind: z.enum(['tool', 'action']), name: z.string(), arguments: z.unknown() })
			.nullable()
	})
);
const toolExecutedEvent = eventSchema(
	'tool.executed',
	z.object({
		name: z.string(),
		arguments: z.unknown(),
		/** The tool's human-readable output — what the bot reads back. */
		result: z.unknown(),
		/**
		 * The structured half of `ToolResult`, dropped until WP13 (`12-…` D6).
		 * The calculator knows the number it worked out; the trace kept only
		 * the sentence about it, so nothing downstream could check the sum
		 * without re-parsing prose.
		 */
		data: z.unknown().optional(),
		durationMs: z.number().nonnegative()
	})
);
const actionPerformedEvent = eventSchema(
	'action.performed',
	z.object({ name: z.string(), arguments: z.unknown(), result: actionResultSchema })
);
const memoryUpdatedEvent = eventSchema(
	'memory.updated',
	z.object({
		windowSize: z.number().int().nonnegative(),
		entries: z.number().int().nonnegative(),
		/**
		 * Whether the notebook was *written to* this tick.
		 *
		 * > **Amended 2026-08-13 (WP13, E8):** it used to report whether a
		 * > notebook *existed*, so a bot that never wrote a word still claimed
		 * > to update its notebook every single tick (`12-…` D6). The
		 * > distinction matters: deliberate writes are the provenance seed for
		 * > the memory-poisoning curriculum (`14-…` §4.2).
		 */
		notebookUpdated: z.boolean()
	})
);
const guardrailCheckedEvent = eventSchema(
	'guardrail.checked',
	z.object({ guardrailId: z.string(), hook: guardrailHookSchema, verdict: guardrailVerdictSchema })
);
const guardrailTrippedEvent = eventSchema(
	'guardrail.tripped',
	z.object({
		guardrailId: z.string(),
		hook: guardrailHookSchema,
		reason: z.string(),
		disposition: z.enum(['block-action', 'stop-run']).optional()
	})
);
const approvalRequestedEvent = eventSchema(
	'approval.requested',
	z.object({ proposed: proposedStepSchema, reason: z.string() })
);
const approvalResolvedEvent = eventSchema('approval.resolved', z.object({ approved: z.boolean() }));
const worldChangedEvent = eventSchema(
	'world.changed',
	z.object({ state: z.record(z.string(), z.unknown()) })
);
const errorEvent = eventSchema(
	'error',
	z.object({ message: z.string(), kind: z.string().optional() })
);

export const engineEventSchema = z.discriminatedUnion('type', [
	runStartedEvent,
	runFinishedEvent,
	tickStartedEvent,
	tickCompletedEvent,
	senseEvent,
	promptComposedEvent,
	thinkStartedEvent,
	thinkTokenEvent,
	thinkCompletedEvent,
	decisionEvent,
	toolExecutedEvent,
	actionPerformedEvent,
	memoryUpdatedEvent,
	guardrailCheckedEvent,
	guardrailTrippedEvent,
	approvalRequestedEvent,
	approvalResolvedEvent,
	worldChangedEvent,
	inputDeliveredEvent,
	providerRetriedEvent,
	errorEvent
]);

export type EngineEvent = z.infer<typeof engineEventSchema>;
export type EventType = EngineEvent['type'];

export function parseEngineEvent(value: unknown): EngineEvent {
	return engineEventSchema.parse(value);
}

export function safeParseEngineEvent(
	value: unknown
): ReturnType<typeof engineEventSchema.safeParse> {
	return engineEventSchema.safeParse(value);
}
