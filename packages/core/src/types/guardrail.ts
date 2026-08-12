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
export type GuardrailHook = 'pre-think' | 'pre-act' | 'post-act';

export type GuardrailVerdict =
	| { allow: true; note?: string }
	| { allow: false; reason: string; disposition: 'block-action' | 'stop-run' }
	| { pause: true; reason: string }; // → approval flow

export interface GuardrailContext {
	hook: GuardrailHook;
	tick: number;
	spec: AgentSpec; // read-only
	usage: { ticks: number; inputTokens: number; outputTokens: number };
	proposed?: { kind: 'tool' | 'action'; name: string; arguments: unknown }; // pre-act
	worldState: Readonly<WorldState>; // read-only snapshot
	history: ReadonlyArray<EngineEvent>; // the trace so far
}

export interface Guardrail {
	id: string; // "safety/step-budget"
	name: string; // "Step Budget"
	description: string;
	hooks: GuardrailHook[];
	check(ctx: GuardrailContext): Promise<GuardrailVerdict> | GuardrailVerdict;
}
