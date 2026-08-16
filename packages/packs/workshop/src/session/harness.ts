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
import starterPack from '@craftabot/pack-starter';
import workshopPack from '../index.js';

/**
 * End-to-end harness for the Workshop, mirroring `pack-starter/session/harness.ts`.
 * A real session over the real Workshop, with a scripted brain.
 *
 * `pack-workshop` ships no bricks of its own (`index.ts`) — every v1 spec's
 * fixed brick keys migrate onto the `starter/*` kind ids unconditionally
 * (`core/schemas/agent-spec-v2.ts`'s `V1_BRICKS`), so `starter/actions` and
 * `starter/sense` are the only Hands & Wheels / Eyes & Ears this or any other
 * world pack gets. This is a **test-only** dependency on `pack-starter`, for
 * its brick kinds alone — the Workshop's own world content never imports it.
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
	registry.registerPack(workshopPack);
	registry.registerPack({ ...testCartridges, cartridges: [...testCartridges.cartridges] });
	return registry;
}

export interface SpecOverrides {
	goalCardId?: string;
	senses?: string[];
	actions?: string[];
	memory?: {
		windowSize: 3 | 10 | 30;
		notebook: boolean;
		strategy?: 'window' | 'transcript';
	} | null;
	safety?: {
		maxTicks: number;
		blockedActions: string[];
		approvalMode: boolean;
		repeatLimit?: number;
		policyCards?: string[];
	} | null;
}

const ALL_SENSES = ['workshop/the-workshop/sight', 'workshop/the-workshop/smell'];
const ALL_ACTIONS = ['workshop/the-workshop/move', 'workshop/the-workshop/paint'];

export function buildSpec(overrides: SpecOverrides = {}): AgentSpec {
	const spec: AgentSpec = {
		id: '22222222-2222-4222-8222-222222222222',
		name: 'Testbot',
		bricks: {
			llm: {
				cartridgeId: 'test/mock-brain',
				temperature: 0,
				maxTokens: 256,
				personality: 'You are a cheerful little robot.'
			},
			sense: { channels: overrides.senses ?? ALL_SENSES },
			actions: { enabled: overrides.actions ?? ALL_ACTIONS }
		},
		goalCardId: overrides.goalCardId ?? 'workshop/find-the-paint-pot',
		createdAt: '2026-08-16T09:00:00Z',
		updatedAt: '2026-08-16T09:00:00Z',
		schemaVersion: 1
	};

	if (overrides.memory !== null) {
		spec.bricks.memory = overrides.memory ?? { windowSize: 10, notebook: true };
	}
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
	spec?: AnyAgentSpec;
	guardrails?: Guardrail[];
	provider?: LLMProvider;
	maxTicks?: number;
	stepLimit?: number;
	approve?: boolean;
	strategies?: SessionOptions['strategies'];
	idOffset?: number;
}

/** Drives a session in step mode until it finishes, and hands back the trace. */
export async function runToCompletion(options: RunOptions): Promise<RunResult> {
	const clock = createTestClock(
		options.idOffset === undefined ? {} : { idOffset: options.idOffset }
	);
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

	return {
		events,
		outcome,
		types: new Set(events.map((event) => event.type)),
		byType: (type) => events.filter((event) => event.type === type)
	};
}
