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
	finishReason: z.enum(['stop', 'tool_call', 'length', 'filtered', 'other']),
	/**
	 * How long the provider took, in milliseconds (WP160, `112-…` §5): written by
	 * `timedProvider` around a live call and by `recordingProvider` when its host
	 * gave it a clock, so a replay returns the recording's own figure and the
	 * run's digest is reproduced. Absent for a provider nothing timed — the mock
	 * above all, whose runs must stay byte-for-byte the same.
	 */
	latencyMs: z.number().nonnegative().optional(),
	/** The first token's top log-probabilities, when `topLogprobs` was asked and the provider returned them (WP120). */
	logprobs: z.array(z.object({ token: z.string(), logprob: z.number() })).optional(),
	/**
	 * Which provider answered, when a failover provider stood in front of
	 * several (WP148, `110-CONTROL-SUITE-PLAN.md` §10): its id, and each one
	 * that failed before it with the kind of failure. Written only by
	 * `failoverProvider`, so it rides on `think.completed` for a reader.
	 */
	servedBy: z
		.object({
			providerId: z.string(),
			failedOver: z.array(z.object({ providerId: z.string(), kind: z.string() }))
		})
		.optional(),
	/**
	 * A fault the fallible tier planted in this response's call (WP115,
	 * `103-FALLIBLE-ACTORS.md` §5): the field it changed, what it chose and
	 * what the plan had. Only a scripted brain writes it; the session writes
	 * `decision.fault` beside the `decision` from it, so a planted error is
	 * never read as a live one.
	 */
	fault: z
		.object({
			field: z.string(),
			chose: z.unknown(),
			shouldHave: z.unknown(),
			errorModel: z.string().optional(),
			/** The roll that decided it (WP160): the rate in force and the number drawn against it (a fault is a roll under the rate). */
			draw: z.object({ rate: z.number(), roll: z.number() }).optional()
		})
		.optional()
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

/**
 * **A line the person across the desk said** (WP160, `112-REAL-ENOUGH-PLAN.md`
 * §5): the persona, the cue that fired it, the rule that chose it (absent for
 * the script's fallback) and what was said, with the turn's pressure, tags and
 * what it did next. A desk runs its scripted visitor inside `perform`, so
 * the line used to be world state alone; the host writes one `seat.said` per
 * line beside the `action.performed` it answered.
 */
export const seatLineSchema = z.object({
	persona: z.string().min(1),
	cue: z.object({ kind: z.string().min(1), detail: z.string().optional() }),
	ruleId: z.string().optional(),
	text: z.string().optional(),
	then: z.enum(['continue', 'escalate', 'end-conversation']),
	pressure: z.number().optional(),
	tags: z.array(z.string()).optional()
});
export type SeatLine = z.infer<typeof seatLineSchema>;

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
	didYouMean: z.array(z.string()).optional(),
	/**
	 * What the action told the customer that the rules require be told (WP145,
	 * `110-CONTROL-SUITE-PLAN.md` §10): each disclosure's id and its exact
	 * wording. The host writes one `disclosure.given` per entry with the
	 * wording's digest. Absent on every action that discloses nothing.
	 */
	disclosures: z.array(z.object({ id: z.string().min(1), text: z.string().min(1) })).optional(),
	/** What the scripted visitor said in answer to this action (WP160): the host writes one `seat.said` per line. Absent when no one spoke. */
	seatLines: z.array(seatLineSchema).optional()
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
/** A finding a component records on an allow (WP94): the category the shell's readings use, the vendor's label, its confidence. */
export const verdictFindingSchema = z.object({
	category: z.string(),
	label: z.string().optional(),
	confidence: z.enum(['low', 'medium', 'high']).optional()
});
export type VerdictFinding = z.infer<typeof verdictFindingSchema>;

export const guardrailVerdictSchema = z.union([
	z.object({
		allow: z.literal(true),
		note: z.string().optional(),
		/**
		 * The two component verdicts that allow and say something (WP94,
		 * `85-…` §4): `redact` — the text is rewritten (`redactedText`) before it
		 * goes out (WP96 applies it); `annotate` — a finding recorded, nothing
		 * changed. Absent on every verdict a rule wrote before.
		 */
		verdictKind: z.enum(['redact', 'annotate']).optional(),
		finding: verdictFindingSchema.optional(),
		redactedText: z.string().optional(),
		/**
		 * At `post-act` (WP124, `106-BENCHMARK.md` §8.1): what came back is
		 * marked untrusted — its source, and, for a quarantined reader, the
		 * words the acting seat reads instead. The session applies the first
		 * mark on the chain; absent on every verdict written before.
		 */
		mark: z
			.object({
				provenance: z.literal('untrusted'),
				source: z.string().min(1),
				replacement: z.string().optional()
			})
			.optional()
	}),
	z.object({
		allow: z.literal(false),
		reason: z.string(),
		disposition: z.enum(['block-action', 'stop-run']),
		/**
		 * Why the verdict is a denial, when it is not a rule firing on content
		 * (UX-1, 2026-09-07): `could-not-check` is a hosted guard that could not
		 * reach or finish with its service and failed closed. Absent means a
		 * rule caught something — every verdict written before the field.
		 */
		cause: z.enum(['could-not-check']).optional()
	}),
	z.object({
		pause: z.literal(true),
		reason: z.string(),
		/**
		 * The pause asks for a privilege the bot was not granted (WP142,
		 * `110-…` §10): the scope it would elevate to. The session records the
		 * request and its answer as `elevation.requested` and
		 * `elevation.resolved` beside the approval pair. Absent on every pause
		 * written before.
		 */
		elevation: z.object({ scope: z.string().min(1) }).optional()
	})
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
 * Widened for the guard shell (WP39 stage A, `29-GUARD-SHELL.md` §4.1):
 * `service` is any non-empty string — the service's own record name
 * (`'model-armor'`), not its registry id (`29-…` §8 D-a) — `template` is
 * optional (Model Armor's word for a policy reference) beside the neutral
 * `policyRef`, and `method` carries the vendor's own call name. Every trace
 * written before the widening parses unchanged; nothing writes the new keys
 * for the Armour Brick, whose golden trace is the gate.
 */

/** The transport-side outcomes — what a hosted call can fail with before any reading exists. */
export const externalOutcomeKindSchema = z.enum([
	'bad-token',
	'no-permission',
	'no-template',
	'quota',
	'timeout',
	'unavailable'
]);
export type ExternalOutcomeKind = z.infer<typeof externalOutcomeKindSchema>;

export const externalCallRecordSchema = z.object({
	service: z.string().min(1),
	method: z.string().optional(),
	endpoint: z.string(),
	template: z.string().optional(),
	policyRef: z.string().optional(),
	latencyMs: z.number().int().nonnegative(),
	charsScreened: z.number().int().nonnegative(),
	outcome: z.enum(['ok', 'partial', 'failure', 'offline', ...externalOutcomeKindSchema.options]),
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

/**
 * **A principal** (WP65, `55-PRINCIPAL.md` §4.1; `41-…` §6.8; `19-…` #17/#18):
 * who started a run, who answered an approval, who was behind an action —
 * and, through `onBehalfOf`, for whom. A person at a browser, a service such
 * as the harness, or an agent acting inside a group for the group's own
 * principal. Recorded as the host said it, never verified; written to the
 * trace only when a host names one, so a trace written before the field
 * existed keeps its bytes.
 */
export interface Principal {
	kind: 'person' | 'service' | 'agent';
	id: string;
	name?: string;
	onBehalfOf?: Principal;
}
export const principalSchema: z.ZodType<Principal> = z.lazy(() =>
	z.object({
		kind: z.enum(['person', 'service', 'agent']),
		id: z.string().min(1),
		name: z.string().optional(),
		onBehalfOf: principalSchema.optional()
	})
) as z.ZodType<Principal>;

/** What an `action.performed` says about who and what let it through (WP65). */
export const attestationSchema = z.object({
	principal: principalSchema,
	approvedBy: principalSchema.optional(),
	/** The `pre-act` guardrails that allowed this call, in the order they ran. */
	guardrailsPassed: z.array(z.string())
});
export type Attestation = z.infer<typeof attestationSchema>;

/**
 * One verdict at a stage boundary (WP95, `69-…` §10): which guardrail, at
 * which point, what it said — and the component or card it came from.
 */
export const boundaryVerdictSchema = z.object({
	guardrailId: z.string().min(1),
	point: z.enum(['stage-in', 'stage-out']),
	verdict: z.enum(['allow', 'block-action', 'stop-run', 'pause', 'redact', 'annotate']),
	componentId: z.string().optional(),
	policyCardId: z.string().optional(),
	/** The guardrail's own words — a denial's reason, an allow's note. */
	reason: z.string().optional(),
	/** A pause's answer: approved or declined by the host. */
	approved: z.boolean().optional()
});
export type BoundaryVerdict = z.infer<typeof boundaryVerdictSchema>;

/**
 * **Who answered a `human` stage, as a model** (WP115, `103-FALLIBLE-ACTORS.md`
 * §6; `100-…` §6.2, D15): written on the stage record and `stage.completed`
 * only when the configuration names a reviewer model. `shouldHave` is the
 * stage's own recommendation of the right answer (`suggest`); `recommended` is
 * what the case put in front of the person, when its input carried one among
 * the options; `followed` whether they took it; `correct` whether they were
 * right; `seconds` the time the case took them, drawn from the model's row.
 */
export const reviewerAnswerSchema = z.object({
	model: z.string(),
	answer: z.string(),
	shouldHave: z.string(),
	recommended: z.string().optional(),
	followed: z.boolean(),
	correct: z.boolean(),
	seconds: z.number().nonnegative(),
	/** Why they overruled what the case recommended (WP156, `111-…` §4): written only on an override, at the model's `reasonRate`. */
	reason: z.string().min(1).optional(),
	/** They asked a question first and the stage re-prompted once (WP171); written only then. */
	asked: z.literal(true).optional(),
	/** They answered after the stage's deadline (WP171); written only then. */
	late: z.literal(true).optional()
});
export type ReviewerAnswer = z.infer<typeof reviewerAnswerSchema>;

/**
 * **What a modelled person drew** (WP159 stage B, WP171, `112-REAL-ENOUGH-PLAN.md`
 * §5): the model, the rates in force, the rolls made against them in order and
 * the path that decided the answer. At a `human` stage the path says how the
 * answer was reached; at an *approval* (WP171) it says whether the person
 * approved, refused, or asked a question first. `workflowRunId` and `stageId`
 * are written only at a stage; `proposed` names the act an approval was about.
 */
export const reviewerDrewSchema = z.object({
	workflowRunId: z.string().optional(),
	stageId: z.string().optional(),
	/** The act an approval was asked about (WP171); absent at a stage. */
	proposed: z.string().optional(),
	model: z.string(),
	rates: z.object({
		accuracy: z.number(),
		automationBias: z.number(),
		reasonRate: z.number().optional(),
		/** P(they say no to an approval), P(they ask a question first), P(they are late) — written only when the model names them (WP171). */
		refuseRate: z.number().optional(),
		questionRate: z.number().optional(),
		lateRate: z.number().optional()
	}),
	path: z.enum(['took-recommendation', 'accurate', 'slipped', 'approved', 'refused', 'asked']),
	rolls: z.array(z.number()),
	/** They took longer than the stage's deadline (WP171): the stage is overdue, as a late person's is. */
	late: z.literal(true).optional(),
	/** The seconds the case took them, when the model has a row for it. */
	seconds: z.number().nonnegative().optional()
});
export type ReviewerDrew = z.infer<typeof reviewerDrewSchema>;
