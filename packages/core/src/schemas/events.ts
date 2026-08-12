import { z } from 'zod';

/**
 * The event catalogue (02-AGENT-MODEL.md §7) — the observability spine.
 * Crosses a storage/export boundary (traces, 07-DATA-MODEL-PERSISTENCE.md),
 * so this schema is the type source for `EngineEvent` (10-CODING-STANDARDS.md §1).
 * Payload shapes mirror the hand-written provider/world/guardrail interfaces
 * field-by-field; nested "raw wire" blobs stay `z.unknown()`, matching those
 * interfaces' own use of `unknown`. WP3 (the real loop) may need small
 * additive refinements as this catalogue gets its first real producer.
 */

const runOutcomeSchema = z.enum([
	'SUCCESS',
	'OUT_OF_STEPS',
	'STOPPED_BY_USER',
	'STOPPED_BY_GUARDRAIL',
	'ERROR'
]);

const usageSchema = z.object({
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative()
});

const chatMessageSchema = z.object({
	role: z.enum(['system', 'user', 'assistant', 'tool']),
	content: z.string(),
	toolCallId: z.string().optional(),
	name: z.string().optional()
});

const chatResponseSchema = z.object({
	text: z.string(),
	toolCall: z.object({ name: z.string(), arguments: z.unknown() }).nullable().optional(),
	usage: usageSchema,
	raw: z.unknown(),
	finishReason: z.enum(['stop', 'tool_call', 'length', 'filtered', 'other'])
});

const observationSchema = z.object({
	channels: z.array(z.string()),
	text: z.string(),
	data: z.record(z.string(), z.unknown()).optional()
});

const actionResultSchema = z.object({
	ok: z.boolean(),
	narration: z.string(),
	stateDiff: z.unknown().optional()
});

const guardrailVerdictSchema = z.union([
	z.object({ allow: z.literal(true), note: z.string().optional() }),
	z.object({
		allow: z.literal(false),
		reason: z.string(),
		disposition: z.enum(['block-action', 'stop-run'])
	}),
	z.object({ pause: z.literal(true), reason: z.string() })
]);

const guardrailHookSchema = z.enum(['pre-think', 'pre-act', 'post-act']);

const proposedStepSchema = z.object({
	kind: z.enum(['tool', 'action']),
	name: z.string(),
	arguments: z.unknown()
});

/** Shared envelope (02-AGENT-MODEL.md §7) around one event type's payload. */
function eventSchema<Type extends string, Payload extends z.ZodTypeAny>(
	type: Type,
	payload: Payload
) {
	return z.object({
		id: z.string().uuid(),
		runId: z.string().uuid(),
		tick: z.number().int().nonnegative(),
		timestamp: z.string().datetime(),
		type: z.literal(type),
		payload
	});
}

const runStartedEvent = eventSchema('run.started', z.object({ mode: z.enum(['step', 'play']) }));
const runFinishedEvent = eventSchema(
	'run.finished',
	z.object({ outcome: runOutcomeSchema, ticks: z.number().int().nonnegative(), usage: usageSchema })
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
const thinkStartedEvent = eventSchema('think.started', z.object({ model: z.string() }));
const thinkTokenEvent = eventSchema('think.token', z.object({ delta: z.string() }));
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
		result: z.unknown(),
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
