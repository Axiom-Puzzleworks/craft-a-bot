import type {
	EvaluationRecord,
	Evaluator,
	LLMProvider,
	PackRegistry,
	RunRecord,
	Storage
} from '@craftabot/core';
import { evaluationInputFor, evaluatorsOf, resolveEvaluator } from '@craftabot/evals';
import { createBrowserKeyVault } from '$lib/state/keys.js';

/**
 * **Running an evaluator over a stored run** (`31-EVALUATORS.md` §4.3, WP43
 * stage C): the one path the Evaluators page and the Run Lab share. A
 * `deterministic` evaluator runs as it is; a `model` one runs through the
 * run's own provider and wire model when that provider's battery is in, and
 * through its offline stand-in otherwise — never a silent pass; a `hosted`
 * one runs offline in the browser (its live host is the harness). Every
 * result is persisted as an `EvaluationRecord` beside the run.
 */

export interface RunEvaluatorOptions {
	config?: unknown;
	/** Overrides the vault lookup — tests hand a provider in. */
	provider?: LLMProvider;
	now?: () => string;
	newId?: () => string;
}

export function availableEvaluators(registry: PackRegistry): Evaluator[] {
	return evaluatorsOf(registry);
}

/** The provider the run itself used, when its battery is in; `undefined` means "run offline". */
export function providerForRun(run: RunRecord, registry: PackRegistry): LLMProvider | undefined {
	const factory = registry.getProviderFactory(run.providerId);
	if (!factory) return undefined;
	if (factory.keyRequirement === 'none') return factory.create({ apiKey: '' });
	const apiKey = createBrowserKeyVault().get(factory.id);
	return apiKey === undefined ? undefined : factory.create({ apiKey });
}

export async function runEvaluator(
	storage: Storage,
	registry: PackRegistry,
	runId: string,
	evaluatorId: string,
	options: RunEvaluatorOptions = {}
): Promise<EvaluationRecord | undefined> {
	const run = await storage.getRun(runId);
	if (!run) return undefined;
	const evaluator = resolveEvaluator(registry, evaluatorId);
	if (!evaluator) return undefined;
	const events = (await storage.getEvents(runId)).map((row) => row.event);
	const input = evaluationInputFor(events, run);

	let runner: Pick<Evaluator, 'evaluate'> = evaluator;
	let provider: LLMProvider | undefined;
	if (evaluator.kind === 'model') {
		provider = options.provider ?? providerForRun(run, registry);
		if (!provider) runner = evaluator.createOffline?.() ?? evaluator;
	} else if (evaluator.kind === 'hosted') {
		runner = evaluator.createOffline?.() ?? evaluator;
	}

	const result = await runner.evaluate(input, {
		...(options.config !== undefined ? { config: options.config } : {}),
		...(provider ? { provider, model: run.wireModel } : {}),
		fetch: globalThis.fetch.bind(globalThis),
		getCredential: (id) => createBrowserKeyVault().get(id)
	});
	const record: EvaluationRecord = {
		id: options.newId?.() ?? crypto.randomUUID(),
		runId,
		evaluatorId: evaluator.id,
		result,
		evaluatedAt: options.now?.() ?? new Date().toISOString(),
		schemaVersion: 1
	};
	await storage.putEvaluation(record);
	return record;
}
