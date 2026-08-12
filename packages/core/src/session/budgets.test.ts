import { describe, expect, it } from 'vitest';
import {
	DEFAULT_REQUEST_TIMEOUT_MS,
	DEFAULT_TICK_BUDGET,
	DEFAULT_TOKEN_BUDGET,
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

describe('the Safety Brick', () => {
	it('tightens the tick budget when fitted', () => {
		const limits = resolveBudgets(
			spec({ safety: { maxTicks: 5, blockedActions: [], approvalMode: false } })
		);
		expect(limits.maxTicks).toBe(5);
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
