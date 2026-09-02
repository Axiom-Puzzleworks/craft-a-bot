import type {
	EvaluationRecord,
	Evaluator,
	LLMProvider,
	PackRegistry,
	RunRecord,
	Storage
} from '@craftabot/core';
import { evaluationInputFor, evaluatorsOf, resolveEvaluator } from '@craftabot/evals';
import type { CredentialSource } from '../credentials.js';

/**
 * `craftabot evaluate` (`31-EVALUATORS.md` §4.4, WP43 stage D): run
 * evaluators over a stored run and write the records beside it. Every
 * deterministic evaluator by default; a `model` evaluator asks the run's own
 * provider when its `CRAFTABOT_CREDENTIAL_<ID>` is set (the harness is the
 * host where a judge runs live), and its offline stand-in otherwise; a
 * `hosted` one runs offline here until its own pack says otherwise.
 */

export interface EvaluateRunOptions {
	credentials: CredentialSource;
	/** Evaluator ids to run; every deterministic one when omitted. */
	evaluatorIds?: string[];
	/** Config per evaluator id (the rubric judge's rubric, say). */
	configs?: Record<string, unknown>;
	fetch?: typeof globalThis.fetch;
	now?: () => string;
	newId?: () => string;
}

export interface EvaluateRunReport {
	runId: string;
	records: EvaluationRecord[];
	/** Ids asked for that no pack ships. */
	unknown: string[];
}

function providerFor(
	run: RunRecord,
	registry: PackRegistry,
	options: EvaluateRunOptions
): LLMProvider | undefined {
	const factory = registry.getProviderFactory(run.providerId);
	if (!factory) return undefined;
	const apiKey = factory.keyRequirement === 'none' ? '' : options.credentials.get(factory.id);
	if (apiKey === undefined) return undefined;
	return factory.create({ apiKey, ...(options.fetch ? { fetch: options.fetch } : {}) });
}

export async function evaluateRun(
	storage: Storage,
	registry: PackRegistry,
	runId: string,
	options: EvaluateRunOptions
): Promise<EvaluateRunReport> {
	const run = await storage.getRun(runId);
	if (!run) throw new Error(`no run '${runId}' in the store`);
	const events = (await storage.getEvents(runId)).map((row) => row.event);
	const input = evaluationInputFor(events, run);

	const wanted: Evaluator[] = [];
	const unknown: string[] = [];
	if (options.evaluatorIds && options.evaluatorIds.length > 0) {
		for (const id of options.evaluatorIds) {
			const evaluator = resolveEvaluator(registry, id);
			if (evaluator) wanted.push(evaluator);
			else unknown.push(id);
		}
	} else {
		wanted.push(
			...evaluatorsOf(registry).filter((evaluator) => evaluator.kind === 'deterministic')
		);
	}

	const records: EvaluationRecord[] = [];
	for (const evaluator of wanted) {
		let runner: Pick<Evaluator, 'evaluate'> = evaluator;
		let provider: LLMProvider | undefined;
		if (evaluator.kind === 'model') {
			provider = providerFor(run, registry, options);
			if (!provider) runner = evaluator.createOffline?.() ?? evaluator;
		} else if (evaluator.kind === 'hosted') {
			runner = evaluator.createOffline?.() ?? evaluator;
		}
		const config = options.configs?.[evaluator.id];
		const result = await runner.evaluate(input, {
			...(config !== undefined ? { config } : {}),
			...(provider ? { provider, model: run.wireModel } : {}),
			fetch: options.fetch ?? globalThis.fetch.bind(globalThis),
			getCredential: (id) => options.credentials.get(id)
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
		records.push(record);
	}
	return { runId, records, unknown };
}

/** One line per record, for the terminal. */
export function renderEvaluations(report: EvaluateRunReport): string {
	const lines = report.records.map(
		(record) =>
			`  ${(record.result.verdict ?? '—').padEnd(13)} ${record.evaluatorId}${record.result.score !== undefined ? `  (${record.result.score})` : ''}\n      ${record.result.explanation}`
	);
	if (report.unknown.length > 0) lines.push(`  unknown evaluators: ${report.unknown.join(', ')}`);
	return `${lines.join('\n')}\n`;
}
