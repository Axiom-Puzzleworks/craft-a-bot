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
import { z } from 'zod';
import type { AgentSpec } from '../schemas/agent-spec.js';
import type { AgentSpecV2 } from '../schemas/agent-spec-v2.js';
import type { BrickKindDefinition } from '../types/brick.js';
import { createPackRegistry } from '../pack-registry.js';
import { v1BrickKinds } from '../testing/brick-kinds.js';

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

/**
 * The dial is read through the safety *slot contract* since WP14 slice 3d, so
 * these need a registry: whatever is in the socket supplies `maxTicks`, and a
 * kind nothing registered supplies nothing.
 */
function registry() {
	const built = createPackRegistry();
	built.registerPack({
		id: 'test',
		name: 'Test',
		version: '1.0.0',
		requiresCore: '>=0.0.1',
		brickKinds: v1BrickKinds()
	});
	return built;
}

describe('the engine floor (08-GOVERNANCE-GUARDRAILS.md §3)', () => {
	it('applies with no Safety Brick fitted at all', () => {
		expect(resolveBudgets(spec(), registry())).toEqual({
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
		resolveBudgets(
			spec({ safety: { maxTicks, blockedActions: [], approvalMode: false } }),
			registry()
		);

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
		expect(resolveBudgets(spec(), registry()).maxTicks).toBe(DEFAULT_TICK_BUDGET);
	});

	/**
	 * The slot contract's stated limit, pinned (WP14 slice 3d). A brick in the
	 * safety socket that carries no dial — a Monitor, say — has none to read, and
	 * a bot nobody set a limit on gets the platform's.
	 */
	it('falls back to the floor for a safety brick with no dial', () => {
		const built = createPackRegistry();
		built.registerPack({
			id: 'test',
			name: 'Test',
			version: '1.0.0',
			requiresCore: '>=0.0.1',
			brickKinds: [
				{
					id: 'test/monitor',
					slot: 'safety',
					name: 'Monitor',
					description: 'Watches',
					realName: 'Monitor',
					realExplanation: 'Watches',
					configSchema: z.object({ watchFor: z.array(z.string()) }),
					configVersion: 1,
					defaults: { watchFor: [] }
				} as BrickKindDefinition
			]
		});

		const withMonitor: AgentSpecV2 = {
			id: '11111111-1111-4111-8111-111111111111',
			name: 'Testbot',
			schemaVersion: 2,
			bricks: [
				{ slot: 'safety', kind: 'test/monitor', configVersion: 1, config: { watchFor: ['open'] } }
			],
			goalCardId: 'starter/say-hello',
			identity: { displayName: 'Testbot', boxArtSeed: '' },
			createdAt: '2026-08-12T09:00:00Z',
			updatedAt: '2026-08-12T09:00:00Z'
		};

		expect(resolveBudgets(withMonitor, built).maxTicks).toBe(DEFAULT_TICK_BUDGET);
		expect(displayedTickBudget(withMonitor, built)).toBe(DEFAULT_TICK_BUDGET);
	});
});

describe('the displayed tick budget', () => {
	it('shows the dial, not the backstop, when a brick is fitted', () => {
		// The gauge has to agree with the brick the player can see (03 §5.1).
		const fitted = spec({ safety: { maxTicks: 5, blockedActions: [], approvalMode: false } });
		expect(displayedTickBudget(fitted, registry())).toBe(5);
		expect(resolveBudgets(fitted, registry()).maxTicks).toBe(DEFAULT_TICK_BUDGET);
	});

	it('falls back to the floor with no brick', () => {
		expect(displayedTickBudget(spec(), registry())).toBe(DEFAULT_TICK_BUDGET);
	});

	it('honours a host override', () => {
		expect(displayedTickBudget(spec(), registry(), { maxTicks: 7 })).toBe(7);
	});
});

describe('host overrides', () => {
	it('win over both the brick and the floor', () => {
		const limits = resolveBudgets(
			spec({ safety: { maxTicks: 5, blockedActions: [], approvalMode: false } }),
			registry(),
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
