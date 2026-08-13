import type { AgentSpec } from '../schemas/agent-spec.js';
import type { EngineEvent } from '../schemas/events.js';
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
import type { GuardrailHook, GuardrailVerdict } from '../schemas/shared.js';
export type { GuardrailHook, GuardrailVerdict };

export interface GuardrailContext {
	hook: GuardrailHook;
	tick: number;
	spec: AgentSpec; // read-only
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
}

export interface Guardrail {
	id: string; // "safety/step-budget"
	name: string; // "Step Budget"
	description: string;
	hooks: GuardrailHook[];
	check(ctx: GuardrailContext): Promise<GuardrailVerdict> | GuardrailVerdict;
}
