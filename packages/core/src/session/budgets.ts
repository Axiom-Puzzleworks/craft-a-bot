import type { PackRegistry } from '../pack-registry.js';
import type { AnyAgentSpec } from '../schemas/agent-spec-v2.js';
import { safetySlotSchema, slotConfig } from '../schemas/slot-contracts.js';

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
 * Nothing can loosen the token budget or the timeout below the floor except an
 * explicit host override (the workbench never offers one — it exists for tests
 * and embedders).
 *
 * > **Amended 2026-08-12 (WP8):** the Safety Brick's `maxTicks` dial no longer
 * > *replaces* the tick floor. The dial is now enforced by the
 * > `safety/step-budget` guardrail in `@craftabot/governance`, so that stopping
 * > because of a rule the builder set is distinguishable from stopping because
 * > the platform said enough — different outcome, different end card
 * > (08-GOVERNANCE-GUARDRAILS.md §3).
 * >
 * > What remains here is a pure backstop, and it must never sit *below* the
 * > dial: a user who asks for 50 turns would otherwise be cut off at the floor
 * > of 30 by a limit the UI never showed them, and the guardrail their brick
 * > installed would never get to fire.
 */
export function resolveBudgets(
	spec: AnyAgentSpec,
	registry: PackRegistry,
	overrides: BudgetOverrides = {}
): BudgetLimits {
	return {
		maxTicks: overrides.maxTicks ?? backstopTicks(spec, registry),
		maxTokens: overrides.maxTokens ?? DEFAULT_TOKEN_BUDGET,
		requestTimeoutMs: overrides.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
	};
}

/**
 * The engine's hard ceiling: the floor, or the user's dial if that is higher.
 *
 * > **Amended 2026-08-13 (WP14 slice 3d):** read through the safety *slot
 * > contract* rather than `spec.bricks.safety`, which is what made this one of
 * > the last two places in core looking at a bot through v1's window. Whatever
 * > is fitted to the safety socket supplies the dial if it has one; a brick that
 * > has none — a Monitor, say — leaves the backstop at the floor, which is the
 * > right answer for a bot nobody set a limit on. The registry is the price of
 * > that, and a smaller one than it looked: the workbench's only call site makes
 * > a registry twelve lines earlier.
 */
function backstopTicks(spec: AnyAgentSpec, registry: PackRegistry): number {
	return Math.max(DEFAULT_TICK_BUDGET, dial(spec, registry) ?? 0);
}

/** The builder's tick dial, if the brick in the safety socket has one. */
function dial(spec: AnyAgentSpec, registry: PackRegistry): number | undefined {
	return slotConfig(spec, registry, 'safety', safetySlotSchema)?.maxTicks;
}

/**
 * What the "steps left" gauge should count down from (03-UI-UX-DESIGN.md §5.1).
 *
 * Deliberately *not* the same number as the engine backstop: the player is
 * governed by their own dial when they fitted a Safety Brick, and showing them
 * the platform's backstop instead would be a gauge that disagrees with the
 * brick they can see on the baseplate.
 */
export function displayedTickBudget(
	spec: AnyAgentSpec,
	registry: PackRegistry,
	overrides: BudgetOverrides = {}
): number {
	// Either shape: the gauge is read straight from a stored bot, and since WP14
	// that is v2. Normalising here rather than at the call site keeps the one
	// place that knows what "the dial" means the one place that reads it.
	return overrides.maxTicks ?? dial(spec, registry) ?? DEFAULT_TICK_BUDGET;
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
