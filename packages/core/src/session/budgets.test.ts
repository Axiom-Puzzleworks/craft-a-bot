import { describe, expect, it } from 'vitest';
import {
	DEFAULT_REQUEST_TIMEOUT_MS,
	DEFAULT_TICK_BUDGET,
	DEFAULT_TOKEN_BUDGET,
	displayedTickBudget,
	resolveBudgets,
	tickBudgetExhausted,
	tokenBudgetExhausted,
	totalTokens
} from './budgets.js';
import type { AgentSpec } from '../schemas/agent-spec.js';

function spec(overrides: Partial<AgentSpec['bricks']> = {}): AgentSpec {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Testbot',
		bricks: { ...overrides },
		goalCardId: 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};
}

describe('the engine floor (08-GOVERNANCE-GUARDRAILS.md §3)', () => {
	it('applies with no Safety Brick fitted at all', () => {
		expect(resolveBudgets(spec())).toEqual({
			maxTicks: DEFAULT_TICK_BUDGET,
			maxTokens: DEFAULT_TOKEN_BUDGET,
			requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS
		});
	});

	it('defaults the tick budget to 30 (02-AGENT-MODEL.md §5)', () => {
		expect(DEFAULT_TICK_BUDGET).toBe(30);
	});
});

/**
 * WP8 moved enforcement of the dial out to the `safety/step-budget` guardrail,
 * so that a run stopped by the builder's own rule is distinguishable from one
 * stopped by the platform. What is left here is a backstop.
 */
describe('the Safety Brick and the backstop', () => {
	const withDial = (maxTicks: number) =>
		resolveBudgets(spec({ safety: { maxTicks, blockedActions: [], approvalMode: false } }));

	it('does not let a tight dial lower the engine backstop', () => {
		// The guardrail stops the run at 5 long before this matters; the backstop
		// exists only to catch a runaway, so tightening it buys nothing.
		expect(withDial(5).maxTicks).toBe(DEFAULT_TICK_BUDGET);
	});

	it('rises to meet a dial set above the floor', () => {
		// Otherwise a user who asked for 50 turns would be cut off at 30 by a
		// limit the UI never showed them, and their guardrail would never fire.
		expect(withDial(50).maxTicks).toBe(50);
	});

	it('leaves the floor in place when no brick is fitted', () => {
		expect(resolveBudgets(spec()).maxTicks).toBe(DEFAULT_TICK_BUDGET);
	});
});

describe('the displayed tick budget', () => {
	it('shows the dial, not the backstop, when a brick is fitted', () => {
		// The gauge has to agree with the brick the player can see (03 §5.1).
		const fitted = spec({ safety: { maxTicks: 5, blockedActions: [], approvalMode: false } });
		expect(displayedTickBudget(fitted)).toBe(5);
		expect(resolveBudgets(fitted).maxTicks).toBe(DEFAULT_TICK_BUDGET);
	});

	it('falls back to the floor with no brick', () => {
		expect(displayedTickBudget(spec())).toBe(DEFAULT_TICK_BUDGET);
	});

	it('honours a host override', () => {
		expect(displayedTickBudget(spec(), { maxTicks: 7 })).toBe(7);
	});
});

describe('host overrides', () => {
	it('win over both the brick and the floor', () => {
		const limits = resolveBudgets(
			spec({ safety: { maxTicks: 5, blockedActions: [], approvalMode: false } }),
			{ maxTicks: 2, maxTokens: 50, requestTimeoutMs: 10 }
		);
		expect(limits).toEqual({ maxTicks: 2, maxTokens: 50, requestTimeoutMs: 10 });
	});
});

describe('exhaustion checks', () => {
	const limits = { maxTicks: 3, maxTokens: 100, requestTimeoutMs: 1000 };

	it('sums both directions of token traffic', () => {
		expect(totalTokens({ ticks: 0, inputTokens: 30, outputTokens: 12 })).toBe(42);
	});

	it('reports the tick budget spent only once it is reached', () => {
		expect(tickBudgetExhausted({ ticks: 2, inputTokens: 0, outputTokens: 0 }, limits)).toBe(false);
		expect(tickBudgetExhausted({ ticks: 3, inputTokens: 0, outputTokens: 0 }, limits)).toBe(true);
	});

	it('reports the token budget spent only once it is reached', () => {
		expect(tokenBudgetExhausted({ ticks: 0, inputTokens: 60, outputTokens: 39 }, limits)).toBe(
			false
		);
		expect(tokenBudgetExhausted({ ticks: 0, inputTokens: 60, outputTokens: 40 }, limits)).toBe(
			true
		);
	});
});
