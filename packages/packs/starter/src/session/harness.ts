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
	llm?: boolean;
	/** Brain dials, for tests that assert they reach the provider. */
	temperature?: number;
	maxTokens?: number;
	personality?: string;
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
			temperature: overrides.temperature ?? 0,
			maxTokens: overrides.maxTokens ?? 256,
			personality: overrides.personality ?? 'You are a cheerful little robot.'
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
	/** Either spec shape; the session normalises (WP14 slice 2b). */
	spec?: AnyAgentSpec;
	guardrails?: Guardrail[];
	provider?: LLMProvider;
	maxTicks?: number;
	/** Stop after this many `step()` calls, so a wandering bot cannot spin forever. */
	stepLimit?: number;
	/**
	 * What to answer when the bot asks permission. Defaults to yes (WP14 slice 3d).
	 *
	 * It needed no answer before, because approval could only reach the engine if
	 * a test compiled the Safety Brick and passed the result in — and none of the
	 * runs through here did. The brick now installs its own rules, so a spec with
	 * `approvalMode` on genuinely parks the run, and a harness that never answers
	 * is a harness that hangs. Tests that care *how* approval behaves drive the
	 * session directly; this only keeps every other run terminating.
	 */
	approve?: boolean;
	/** Hand the session its own strategies, bypassing the spec's dial (E7). */
	strategies?: SessionOptions['strategies'];
	/**
	 * Where this run's deterministic ids start.
	 *
	 * Needed when several runs are stored together — without it every run made
	 * through this harness carries the same event and run ids.
	 */
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

	/*
	 * Answered from the event, not after `step()` resolves: by the time the step
	 * settles the session is already parked on the approval promise, and nothing
	 * would ever resolve it.
	 */
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
