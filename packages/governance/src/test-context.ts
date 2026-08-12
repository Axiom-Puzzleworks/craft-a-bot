import type { AgentSpec, GuardrailContext, GuardrailHook } from '@craftabot/core';

/**
 * A minimal `GuardrailContext` for unit tests. Guardrails are pure functions of
 * this object, which is exactly what makes them cheap to test — no session, no
 * world, no provider.
 */

export function specWithSafety(safety?: {
	maxTicks: number;
	blockedActions: string[];
	approvalMode: boolean;
	repeatLimit?: number;
}): AgentSpec {
	return {
		id: '00000000-0000-4000-8000-000000000000',
		name: 'Testbot',
		bricks: safety ? { safety } : {},
		goalCardId: 'starter/say-hello',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		schemaVersion: 1
	};
}

export function context(overrides: Partial<GuardrailContext> = {}): GuardrailContext {
	const hook: GuardrailHook = overrides.hook ?? 'pre-think';
	return {
		hook,
		tick: overrides.tick ?? 1,
		spec: overrides.spec ?? specWithSafety(),
		usage: overrides.usage ?? { ticks: 1, inputTokens: 0, outputTokens: 0 },
		...(overrides.proposed !== undefined ? { proposed: overrides.proposed } : {}),
		worldState: overrides.worldState ?? {},
		history: overrides.history ?? []
	};
}

/** A proposed world action, the thing pre-act guardrails actually judge. */
export function action(name: string, args: unknown = {}) {
	return { kind: 'action' as const, name, arguments: args };
}

/** A proposed tool call — deliberately *not* a world change. */
export function tool(name: string, args: unknown = {}) {
	return { kind: 'tool' as const, name, arguments: args };
}
