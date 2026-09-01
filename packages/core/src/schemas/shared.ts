import { z } from 'zod';

/**
 * **The shapes that cross every boundary** (E5, `14-…` §3, closing `12-…` D3).
 *
 * `RunOutcome`, `GuardrailVerdict`, `ChatResponse` and `Observation` are each
 * used in three places at once: the engine programs against them, the event
 * catalogue validates them on the way to disk, and packs implement them. Until
 * now each had a hand-written TypeScript interface *and* a Zod mirror, kept in
 * step by a comment.
 *
 * They drifted, of course. `Observation.summary` was added to the interface in
 * WP11 and not to the mirror, so Zod silently deleted it from every re-imported
 * trace — losing the one field a bot navigates by. WP12's drift guard caught it
 * after the fact; this module is the reason there is nothing left to drift.
 *
 * The rule from `10-…` §1: **where a runtime boundary exists, the schema is the
 * type**. These four cross one every time they are written to a trace, so they
 * are defined here in Zod and inferred everywhere else. The interfaces in
 * `types/` now re-export these types rather than redeclaring them.
 */

export const runOutcomeSchema = z.enum([
	'SUCCESS',
	'OUT_OF_STEPS',
	'STOPPED_BY_USER',
	'STOPPED_BY_GUARDRAIL',
	'ERROR'
]);
export type RunOutcome = z.infer<typeof runOutcomeSchema>;

export const usageSchema = z.object({
	inputTokens: z.number().int().nonnegative(),
	outputTokens: z.number().int().nonnegative()
});
export type TokenUsage = z.infer<typeof usageSchema>;

/**
 * A call an assistant turn made, as it goes back on the wire (E7).
 *
 * The mirror of `toolCallId` on a `tool` message: without it a transcript has
 * answers to calls that were never recorded as made, which every provider
 * rejects. `12-…` D12 is exactly this half being absent.
 */
export const assistantToolCallSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	arguments: z.unknown()
});
export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>;

export const chatMessageSchema = z.object({
	role: z.enum(['system', 'user', 'assistant', 'tool']),
	content: z.string(),
	toolCallId: z.string().optional(),
	name: z.string().optional(),
	/**
	 * Optional so that every trace written before WP15 still parses — the field
	 * is absent from a `sections-v1` prompt, which is every prompt the kit has
	 * ever composed, so no migration is owed.
	 */
	toolCalls: z.array(assistantToolCallSchema).optional()
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatResponseSchema = z.object({
	/** The assistant's prose — what the thought bubble shows. */
	text: z.string(),
	/** At most one call is honoured per turn (the V1 rule, `02-…` §5). */
	toolCall: z.object({ name: z.string(), arguments: z.unknown() }).nullable().optional(),
	usage: usageSchema,
	/** The exact wire response, kept for the trace. */
	raw: z.unknown(),
	finishReason: z.enum(['stop', 'tool_call', 'length', 'filtered', 'other'])
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

/** What a Sense brick yields for a tick — prose for the prompt, data for the UI (`02-…` §8). */
export const observationSchema = z.object({
	channels: z.array(z.string()),
	text: z.string(),
	/**
	 * A one-line version of `text`, for the memory window.
	 *
	 * Remembering the full observation turned the prompt into wallpaper: each
	 * one is a dozen lines, most of them "nothing but rug", and a window of ten
	 * made the history **86% of the prompt** while the goal and the current
	 * situation shrank to a footnote. The world writes the short form because
	 * only the world knows which of its own lines carry information.
	 *
	 * Since WP11 it also carries position and bearings, which is what makes a
	 * remembered sighting something a bot can act on rather than merely recall.
	 *
	 * Optional: a world that omits it simply gets the full text remembered.
	 */
	summary: z.string().optional(),
	data: z.record(z.string(), z.unknown()).optional()
});
export type Observation = z.infer<typeof observationSchema>;

export const actionResultSchema = z.object({
	ok: z.boolean(),
	narration: z.string(),
	stateDiff: z.unknown().optional(),
	/**
	 * The things the bot might have meant, when a name matched more than one of
	 * them (`16-…` §2.4).
	 *
	 * The world has always *said* the candidates — "there are two blocks: block
	 * A and block B" — and prose is the right answer for the bot, which reads
	 * it and tries again. It is the wrong answer for the UI, which would have to
	 * parse English back into a list to offer the child anything tappable.
	 *
	 * Additive, so every trace ever written still parses (`14-…` §7): a world
	 * that does not populate it simply has nothing to offer, and the narration
	 * remains the whole story.
	 */
	didYouMean: z.array(z.string()).optional()
});
export type ActionResult = z.infer<typeof actionResultSchema>;

export const guardrailHookSchema = z.enum(['pre-think', 'pre-act', 'post-act']);
export type GuardrailHook = z.infer<typeof guardrailHookSchema>;

/**
 * Guardrails observe, allow, deny, or pause — never mutate (`08-…` §2).
 *
 * A closed union on purpose: a verdict shape nobody recognises is a policy
 * failing open, and a policy that fails open is worse than no policy, because
 * the trace shows a check that appeared to happen.
 */
export const guardrailVerdictSchema = z.union([
	z.object({ allow: z.literal(true), note: z.string().optional() }),
	z.object({
		allow: z.literal(false),
		reason: z.string(),
		disposition: z.enum(['block-action', 'stop-run'])
	}),
	z.object({ pause: z.literal(true), reason: z.string() })
]);
export type GuardrailVerdict = z.infer<typeof guardrailVerdictSchema>;

/**
 * A hosted guardrail's own record of the network call it made (`25-…` §4.7,
 * WP35 stage B). Returned by `Guardrail.checkWithRecord`, never emitted by the
 * guardrail itself — core turns it into a `guardrail.external` event
 * immediately before `guardrail.checked`, which is what keeps guardrails pure
 * (`08-…` §2, `25-…` decision D3): the guardrail *returns* what it saw, it
 * does not write to a side channel.
 *
 * `service` is a single literal today because the Armour Brick is the first
 * hosted guardrail; a second one (`25-…` §7's non-goal, "the natural second
 * GEAP brick") widens it rather than adding a parallel event.
 */
export const externalCallRecordSchema = z.object({
	service: z.literal('model-armor'),
	endpoint: z.string(),
	template: z.string(),
	latencyMs: z.number().int().nonnegative(),
	charsScreened: z.number().int().nonnegative(),
	outcome: z.enum([
		'ok',
		'partial',
		'failure',
		'offline',
		'bad-token',
		'no-permission',
		'no-template',
		'quota',
		'timeout',
		'unavailable'
	]),
	filters: z
		.record(
			z.string(),
			z.object({ ran: z.boolean(), matched: z.boolean(), confidence: z.string().optional() })
		)
		.optional()
});
export type ExternalCallRecord = z.infer<typeof externalCallRecordSchema>;

/**
 * A stored shape that could not be read, as a value rather than a throw
 * (`10-…` §1).
 *
 * Every versioned file in the app — kit, spec, trace, record — migrates through
 * a table keyed by version and reports failure this way. The interface was
 * written out once per file until it was written out four times; the *messages*
 * differ, deliberately (a kit and a bot are different things to a reader), but
 * the shape never did.
 */
export interface MigrationError {
	kind: 'migration-error';
	message: string;
	/** Kept rather than swallowed: "from a newer set" is actionable, "broken" is not. */
	detectedVersion?: unknown;
}

/** The call a guardrail is being asked about, at `pre-act`. */
export const proposedStepSchema = z.object({
	kind: z.enum(['tool', 'action']),
	name: z.string(),
	arguments: z.unknown()
});
export type ProposedStep = z.infer<typeof proposedStepSchema>;
