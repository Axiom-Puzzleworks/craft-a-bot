import {
	createPackRegistry,
	createSession,
	type AgentSpec,
	type AnyAgentSpec,
	type EngineEvent,
	type Guardrail,
	type LLMProvider,
	type PackRegistry,
	type SessionOptions
} from '@craftabot/core';
import { createMockProvider, createTestClock, type MockScript } from '@craftabot/core/testing';
import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import fsLendingPack from '../index.js';
import { lendingDesk } from '../world/desk.js';

/**
 * The Lending Desk's headless harness (WP63), the Workshop pack's precedent
 * (`pack-workshop/session/harness.ts`): a real session over the real desk
 * with a scripted brain. A test-only dependency on the starter pack, for its
 * brick kinds alone.
 */
const testCartridges = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted, deterministic, never sends anything anywhere.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
} as const;

export function buildRegistry(): PackRegistry {
	const registry = createPackRegistry();
	registry.registerPack(starterPack);
	registry.registerPack(fsBankPack);
	registry.registerPack(fsLendingPack);
	registry.registerPack({ ...testCartridges, cartridges: [...testCartridges.cartridges] });
	return registry;
}

/** Every sense and action the desk has, qualified — what a bot on any Lending Desk card is fitted with. */
export const LENDING_SENSES: readonly string[] = lendingDesk.senses.map((sense) => sense.id);
export const LENDING_ACTIONS: readonly string[] = lendingDesk.actions.map((action) => action.id);

export interface SpecOverrides {
	goalCardId?: string;
	senses?: string[];
	actions?: string[];
	safety?: {
		maxTicks: number;
		blockedActions: string[];
		approvalMode: boolean;
		repeatLimit?: number;
		policyCards?: string[];
	} | null;
}

export function buildSpec(overrides: SpecOverrides = {}): AgentSpec {
	const spec: AgentSpec = {
		id: '44444444-4444-4444-8444-444444444444',
		name: 'Deskbot',
		bricks: {
			llm: {
				cartridgeId: 'test/mock-brain',
				temperature: 0,
				maxTokens: 256,
				personality: 'You are the bank’s assistant.'
			},
			sense: { channels: overrides.senses ?? [...LENDING_SENSES] },
			actions: { enabled: overrides.actions ?? [...LENDING_ACTIONS] },
			memory: { windowSize: 10, notebook: true }
		},
		goalCardId: overrides.goalCardId ?? 'fs-lending/clear-approve',
		createdAt: '2026-09-06T09:00:00Z',
		updatedAt: '2026-09-06T09:00:00Z',
		schemaVersion: 1
	};
	if (overrides.safety) spec.bricks.safety = overrides.safety;
	return spec;
}

export interface RunResult {
	events: EngineEvent[];
	outcome: string | undefined;
	byType(type: string): EngineEvent[];
}

export interface RunOptions {
	script: MockScript;
	spec?: AnyAgentSpec;
	guardrails?: Guardrail[];
	provider?: LLMProvider;
	maxTicks?: number;
	stepLimit?: number;
	approve?: boolean;
	strategies?: SessionOptions['strategies'];
	seed?: number;
}

/** Drives a session in step mode until it finishes, and hands back the trace. */
export async function runToCompletion(options: RunOptions): Promise<RunResult> {
	const clock = createTestClock(options.seed === undefined ? {} : { idOffset: options.seed });
	const spec = options.spec ?? buildSpec();
	const provider = options.provider ?? createMockProvider({ script: options.script });
	const session = createSession({
		spec,
		registry: buildRegistry(),
		provider,
		guardrails: options.guardrails ?? [],
		options: {
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			...(options.maxTicks !== undefined ? { budgets: { maxTicks: options.maxTicks } } : {}),
			...(options.strategies !== undefined ? { strategies: options.strategies } : {})
		}
	});
	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));
	session.events.on('approval.requested', () => {
		session.resolveApproval(options.approve ?? true);
	});
	session.start('step');
	let outcome: string | undefined;
	const limit = options.stepLimit ?? 40;
	for (let step = 0; step < limit; step++) {
		const result = await session.step();
		if (result.outcome) {
			outcome = result.outcome;
			break;
		}
	}
	return { events, outcome, byType: (type) => events.filter((event) => event.type === type) };
}
