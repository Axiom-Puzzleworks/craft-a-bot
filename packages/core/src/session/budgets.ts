import type { AgentSpec } from '../schemas/agent-spec.js';

/**
 * The engine floor (08-GOVERNANCE-GUARDRAILS.md §3): budgets that apply
 * whether or not a Safety Brick is fitted. The brick is *user-configurable*
 * governance; this is *platform* governance, and the two-tier split is
 * deliberately the same shape real deployments use.
 */

/** 02-AGENT-MODEL.md §5. The Safety Brick's `maxTicks` dial overrides this. */
export const DEFAULT_TICK_BUDGET = 30;

/** Generous enough that a normal run never notices, tight enough to stop a runaway. */
export const DEFAULT_TOKEN_BUDGET = 100_000;

/** Per provider request, enforced with an AbortController. */
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;

export interface BudgetLimits {
	maxTicks: number;
	maxTokens: number;
	requestTimeoutMs: number;
}

export interface BudgetOverrides {
	maxTicks?: number;
	maxTokens?: number;
	requestTimeoutMs?: number;
}

export interface Usage {
	ticks: number;
	inputTokens: number;
	outputTokens: number;
}

/**
 * The Safety Brick tightens the tick budget when fitted; nothing can loosen the
 * token budget or the timeout below the floor except an explicit host override
 * (the workbench never offers one — it exists for tests and embedders).
 */
export function resolveBudgets(spec: AgentSpec, overrides: BudgetOverrides = {}): BudgetLimits {
	return {
		maxTicks: overrides.maxTicks ?? spec.bricks.safety?.maxTicks ?? DEFAULT_TICK_BUDGET,
		maxTokens: overrides.maxTokens ?? DEFAULT_TOKEN_BUDGET,
		requestTimeoutMs: overrides.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
	};
}

export function totalTokens(usage: Usage): number {
	return usage.inputTokens + usage.outputTokens;
}

export function tickBudgetExhausted(usage: Usage, limits: BudgetLimits): boolean {
	return usage.ticks >= limits.maxTicks;
}

export function tokenBudgetExhausted(usage: Usage, limits: BudgetLimits): boolean {
	return totalTokens(usage) >= limits.maxTokens;
}
