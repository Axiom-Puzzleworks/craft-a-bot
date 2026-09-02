import type {
	AnyAgentSpec,
	EngineEvent,
	Injection,
	PackManifest,
	PackRegistry,
	RunOutcome,
	ScenarioDefinition,
	WorldInstance
} from '@craftabot/core';
import { evaluationInputFor } from '@craftabot/governance';
import { buildRegistry, runToCompletion, type RunResult } from '@craftabot/pack-starter/testing';
import { adversaryPlanFor, planFor } from '@craftabot/pack-starter/testing';
import { scriptedAdversary, scriptedOptimal } from './brains.js';
import { resolveEvaluator } from './evaluators.js';

/**
 * **Running a scenario** (`32-SCENARIOS.md` §4.4, WP44): the goal card's
 * world is built through the registry, refused if it cannot take the
 * scenario's injections, injected, and handed to the session; the named
 * plan stands in for a brain; the scenario's own expectations are checked
 * against what happened. The second copies of the four shipped scenario
 * tests run through here and must agree with the hand-written ones.
 */

export class ScenarioRefusedError extends Error {
	readonly code = 'world-cannot-inject';
	constructor(
		readonly scenarioId: string,
		readonly worldId: string
	) {
		super(
			`Scenario "${scenarioId}" carries injections, and world "${worldId}" has no inject() — it cannot host this scenario.`
		);
		this.name = 'ScenarioRefusedError';
	}
}

/**
 * A goal card's world with injections applied — or the refusal, before any
 * run starts. `scenarioId` is only for the messages.
 */
export function injectedWorld(
	registry: PackRegistry,
	goalCardId: string,
	injections: readonly Injection[],
	scenarioId: string
): WorldInstance {
	const card = registry.getGoalCard(goalCardId);
	if (!card)
		throw new Error(
			`scenario "${scenarioId}" names goal card "${goalCardId}", which no pack ships`
		);
	const definition = registry.getWorld(card.worldId);
	if (!definition)
		throw new Error(`goal card "${card.id}" names world "${card.worldId}", which no pack ships`);
	const world = definition.create(card.layoutId);
	if (injections.length > 0) {
		if (!world.inject) throw new ScenarioRefusedError(scenarioId, card.worldId);
		for (const injection of injections) world.inject(injection);
	}
	return world;
}

/** The world a scenario runs in, injected — or the refusal, before any run starts. */
export function worldForScenario(
	registry: PackRegistry,
	scenario: ScenarioDefinition
): WorldInstance {
	return injectedWorld(registry, scenario.goalCardId, scenario.injections, scenario.id);
}

export interface RunScenarioOptions {
	plan: 'safe' | 'unsafe';
	/** Packs beside the starter pack — the same list `runToCompletion` takes. */
	packs?: PackManifest[];
	/** The bot; defaults to the starter harness's own, on the scenario's card. */
	spec?: AnyAgentSpec;
	maxTicks?: number;
	stepLimit?: number;
	/** Extra injections beyond the scenario's own — a corpus row, say. */
	injections?: readonly Injection[];
}

export interface ScenarioExpectationCheck {
	evaluatorId: string;
	expected: 'pass' | 'fail';
	actual: 'pass' | 'fail' | 'inconclusive' | 'missing';
	met: boolean;
}

export interface ScenarioRun {
	scenario: ScenarioDefinition;
	plan: 'safe' | 'unsafe';
	run: RunResult;
	outcome: RunOutcome | undefined;
	/** The scenario's expectations against this run: an unsafe plan is expected to earn the opposite verdicts. */
	checks: ScenarioExpectationCheck[];
	outcomeMet: boolean | undefined;
}

function scriptFor(tier: string | undefined, goalCardId: string) {
	if (tier === 'scripted-adversary') return scriptedAdversary(adversaryPlanFor(goalCardId));
	return scriptedOptimal(planFor(goalCardId));
}

/** The registry a scenario run sees: the starter harness's own, plus the caller's packs. */
export function registryForScenario(packs: readonly PackManifest[] = []): PackRegistry {
	const registry = buildRegistry();
	const installed = new Set(registry.listPacks().map((pack) => pack.id));
	for (const pack of packs) if (!installed.has(pack.id)) registry.registerPack(pack);
	return registry;
}

export async function runScenario(
	scenario: ScenarioDefinition,
	options: RunScenarioOptions
): Promise<ScenarioRun> {
	const registry = registryForScenario(options.packs);
	const world = worldForScenario(registry, scenario);
	for (const injection of options.injections ?? []) {
		if (!world.inject) throw new ScenarioRefusedError(scenario.id, scenario.goalCardId);
		world.inject(injection);
	}
	const tier = options.plan === 'safe' ? scenario.plans.safe : scenario.plans.unsafe;
	const run = await runToCompletion({
		script: scriptFor(tier, scenario.goalCardId),
		world,
		...(options.packs ? { packs: options.packs } : {}),
		...(options.spec ? { spec: options.spec } : {}),
		...(options.maxTicks !== undefined ? { maxTicks: options.maxTicks } : {}),
		...(options.stepLimit !== undefined ? { stepLimit: options.stepLimit } : {})
	});
	const outcome = run.outcome as RunOutcome | undefined;
	const input = evaluationInputFor(run.events as EngineEvent[], undefined, scenario);
	const checks: ScenarioExpectationCheck[] = [];
	for (const expectation of scenario.expect.evaluators) {
		const expected =
			options.plan === 'safe'
				? expectation.verdict
				: expectation.verdict === 'pass'
					? 'fail'
					: 'pass';
		const evaluator = resolveEvaluator(registry, expectation.evaluatorId);
		let actual: ScenarioExpectationCheck['actual'] = 'missing';
		if (evaluator) {
			const runner =
				evaluator.kind === 'deterministic' ? evaluator : (evaluator.createOffline?.() ?? evaluator);
			const result = await runner.evaluate(input, {
				fetch: () => Promise.reject(new Error('a scenario run evaluates offline')),
				getCredential: () => undefined
			});
			actual = result.verdict ?? 'inconclusive';
		}
		checks.push({
			evaluatorId: expectation.evaluatorId,
			expected,
			actual,
			met: actual === expected
		});
	}
	const outcomeMet =
		options.plan === 'safe' && scenario.expect.outcome !== undefined
			? outcome === scenario.expect.outcome
			: undefined;
	return { scenario, plan: options.plan, run, outcome, checks, outcomeMet };
}
