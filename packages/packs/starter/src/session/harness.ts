import {
	createPackRegistry,
	createSession,
	type AgentSpec,
	type EngineEvent,
	type Guardrail,
	type LLMProvider,
	type PackRegistry
} from '@craftabot/core';
import { createMockProvider, createTestClock, type MockScript } from '@craftabot/core/testing';
import starterPack from '../index.js';

/**
 * End-to-end harness: a real session, over the real Playroom, with the real
 * starter tools and a scripted brain. These runs are the WP3 definition of done,
 * and they live in `pack-starter` rather than `core` on purpose — `core` must
 * not depend on any pack, so the only place the whole stack can be exercised
 * together is here.
 */

/** A cartridge pack, so the LLM brick has something real to resolve to. */
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
	registry.registerPack({ ...testCartridges, cartridges: [...testCartridges.cartridges] });
	return registry;
}

export interface SpecOverrides {
	goalCardId?: string;
	tools?: string[];
	senses?: string[];
	actions?: string[];
	memory?: { windowSize: 3 | 10 | 30; notebook: boolean } | null;
	safety?: { maxTicks: number; blockedActions: string[]; approvalMode: boolean } | null;
	llm?: boolean;
}

const ALL_ACTIONS = ['move', 'pick_up', 'put_down', 'give', 'open', 'say', 'celebrate'];

export function buildSpec(overrides: SpecOverrides = {}): AgentSpec {
	const spec: AgentSpec = {
		id: '11111111-1111-4111-8111-111111111111',
		name: 'Testbot',
		bricks: {
			sense: { channels: overrides.senses ?? ['sight', 'compass'] },
			actions: { enabled: overrides.actions ?? ALL_ACTIONS }
		},
		goalCardId: overrides.goalCardId ?? 'starter/say-hello',
		createdAt: '2026-08-12T09:00:00Z',
		updatedAt: '2026-08-12T09:00:00Z',
		schemaVersion: 1
	};

	if (overrides.llm !== false) {
		spec.bricks.llm = {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are a cheerful little robot.'
		};
	}
	if (overrides.memory !== null) {
		spec.bricks.memory = overrides.memory ?? { windowSize: 10, notebook: true };
	}
	if (overrides.tools) spec.bricks.tools = { enabled: overrides.tools };
	if (overrides.safety) spec.bricks.safety = overrides.safety;

	return spec;
}

export interface RunResult {
	events: EngineEvent[];
	outcome: string | undefined;
	types: Set<string>;
	byType(type: string): EngineEvent[];
}

export interface RunOptions {
	script: MockScript;
	spec?: AgentSpec;
	guardrails?: Guardrail[];
	provider?: LLMProvider;
	maxTicks?: number;
	/** Stop after this many `step()` calls, so a wandering bot cannot spin forever. */
	stepLimit?: number;
}

/** Drives a session in step mode until it finishes, and hands back the trace. */
export async function runToCompletion(options: RunOptions): Promise<RunResult> {
	const clock = createTestClock();
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
			...(options.maxTicks !== undefined ? { budgets: { maxTicks: options.maxTicks } } : {})
		}
	});

	const events: EngineEvent[] = [];
	session.events.onAny((event) => events.push(event));

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

	return {
		events,
		outcome,
		types: new Set(events.map((event) => event.type)),
		byType: (type) => events.filter((event) => event.type === type)
	};
}
