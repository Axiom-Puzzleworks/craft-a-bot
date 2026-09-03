import type { AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import type { EngineEvent } from '../schemas/events.js';
import type { ChatMessage, ChatResponse, Observation } from '../schemas/shared.js';
import type { WorldState } from './world.js';

/**
 * The guardrail contract (08-GOVERNANCE-GUARDRAILS.md §2). Defined in
 * @craftabot/core — per 01-ARCHITECTURE.md §1.3 core defines the interfaces
 * (bricks, worlds, providers, guardrails, events) and runs the loop;
 * @craftabot/governance (WP8) implements the chain-runner and the three V1
 * rules against this contract, the same way pack-openai implements LLMProvider.
 * Guardrails are pure: they observe, allow, deny, or pause — never mutate.
 */
/**
 * The hook names and the verdict union are defined once, in Zod, and inferred
 * here (E5, `14-…` §3): a verdict is written into every `guardrail.checked`
 * event, so it crosses the trace boundary and the schema is the type.
 * `schemas/shared.ts` carries the shapes and why the union is closed.
 */
import type { ExternalCallRecord, GuardrailHook, GuardrailVerdict } from '../schemas/shared.js';
export type { ExternalCallRecord, GuardrailHook, GuardrailVerdict };

export interface GuardrailContext {
	hook: GuardrailHook;
	tick: number;
	/**
	 * The bot being run, read-only, in whichever shape it was stored (WP14
	 * slice 3c). A guardrail that needs a specific field should read it through
	 * `slotConfig` rather than by v1 key — nothing in the shipped rules does,
	 * because policy is about what is *proposed*, not about what is fitted.
	 */
	spec: AnyAgentSpec; // read-only
	usage: { ticks: number; inputTokens: number; outputTokens: number };
	proposed?: { kind: 'tool' | 'action'; name: string; arguments: unknown }; // pre-act
	worldState: Readonly<WorldState>; // read-only snapshot
	/**
	 * The trace so far — a **live read-only view**, not a copy (E9).
	 *
	 * Read it during `check` and do not keep it: the engine appends to this
	 * array as the run proceeds, so a reference held past the call will keep
	 * changing under a guardrail that thought it had a snapshot.
	 */
	history: ReadonlyArray<EngineEvent>;
	/**
	 * What the tick has in hand so far (WP39 stage A, `29-GUARD-SHELL.md`
	 * §4.2) — so an output filter screens `response.text` directly instead
	 * of walking `history` for it. All three optional: a host that predates
	 * the widening hands none, a reflex tick has no `response`, and nothing
	 * exists before SENSE. A guardrail that reads them must still cope with
	 * their absence, the history walk being the fallback that always works.
	 */
	/** The current observation — present at every hook once SENSE has run this tick. */
	observation?: Observation;
	/** The composed prompt — present from `pre-think` on a brain-driven tick. */
	messages?: readonly ChatMessage[];
	/** The brain's answer — present at `pre-act` and `post-act` on a brain-driven tick; absent for a reflex. */
	response?: ChatResponse;
	/**
	 * The world's own questions (WP45, `33-POLICY-V2-PDP.md` §4.2): `test` is
	 * the instance's, `predicates` the definition's ids — so a `world-predicate`
	 * leaf and a PDP's input document can ask them. Optional: a host that
	 * predates the field hands none.
	 */
	world?: { test(predicateId: string): boolean; predicates: readonly string[] };
}

export interface Guardrail {
	id: string; // "safety/step-budget"
	name: string; // "Step Budget"
	description: string;
	hooks: GuardrailHook[];
	check(ctx: GuardrailContext): Promise<GuardrailVerdict> | GuardrailVerdict;
	/**
	 * A hosted guardrail's alternative to `check` (`25-…` §4.7, WP35 stage B):
	 * same verdict, plus a record of the network call it made. Optional and
	 * additive — a guardrail that only implements `check` (every rule before
	 * WP35) keeps working exactly as before. `runGuardrailChain` prefers this
	 * when present and turns `external` into a `guardrail.external` event
	 * immediately before `guardrail.checked`; guardrails stay pure because
	 * this *returns* the record rather than writing it anywhere (`08-…` §2).
	 */
	checkWithRecord?(
		ctx: GuardrailContext
	): Promise<{ verdict: GuardrailVerdict; external?: ExternalCallRecord }>;
	/**
	 * The policy card (`14-…` §4.6, WP22) this guardrail was compiled from, if
	 * any. Set by `@craftabot/governance`'s `compilePolicyCard` and nothing
	 * else — a hand-written guardrail (the Safety Brick's own four, a
	 * Monitor's rules) simply omits it. The engine copies it onto
	 * `guardrail.checked`/`guardrail.tripped` so a fired card is traceable
	 * without parsing `id` strings for a convention.
	 */
	policyCardId?: string;
}
