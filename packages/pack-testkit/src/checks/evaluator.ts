import type { EvaluationInput, EvaluationResult, Evaluator } from '@craftabot/core';
import { evaluationResultSchema } from '@craftabot/core';
import type { ConformanceIssue, EvaluatorConformanceFixture } from '../types.js';

/**
 * **An evaluator's conformance** (`31-EVALUATORS.md` §4.4, WP43 stage D):
 *
 * - `evaluator.result-shape` — the result parses as an `EvaluationResult`.
 * - `evaluator.deterministic` — a `deterministic` evaluator returns an identical result on the same input twice.
 * - `evaluator.evidence-real` — every evidence row names an event id that is in the input.
 * - `evaluator.offline-present` — a `model`/`hosted` evaluator ships `createOffline`, and it answers.
 * - `evaluator.no-secret-leaks` — a planted credential never appears in the explanation or the external record.
 */
export async function checkEvaluator(
	evaluator: Evaluator,
	fixture: EvaluatorConformanceFixture
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];
	const deps = () => ({
		...(fixture.config !== undefined ? { config: fixture.config } : {}),
		fetch: (() =>
			Promise.reject(
				new Error(`no network in conformance (${fixture.plantedSecret})`)
			)) as typeof globalThis.fetch,
		getCredential: () => fixture.plantedSecret
	});

	const results: EvaluationResult[] = [];
	const runner: Pick<Evaluator, 'evaluate'> | undefined =
		evaluator.kind === 'deterministic' ? evaluator : evaluator.createOffline?.();
	if (!runner) {
		issues.push({
			check: 'evaluator.offline-present',
			message: `"${evaluator.id}" is ${evaluator.kind} but ships no createOffline()`
		});
		return issues;
	}

	for (const input of fixture.inputs) {
		let first: EvaluationResult;
		try {
			first = await runner.evaluate(input, deps());
		} catch (error) {
			issues.push({
				check: 'evaluator.result-shape',
				message: `"${evaluator.id}" threw: ${error instanceof Error ? error.message : String(error)}`
			});
			continue;
		}
		results.push(first);
		if (!evaluationResultSchema.safeParse(first).success) {
			issues.push({
				check: 'evaluator.result-shape',
				message: `"${evaluator.id}" returned a result outside the schema`
			});
		}
		const ids = new Set(input.events.map((event) => event.id));
		if (!first.evidence.every((row) => ids.has(row.eventId))) {
			issues.push({
				check: 'evaluator.evidence-real',
				message: `"${evaluator.id}" cites an event id that is not in the input`
			});
		}
		if (evaluator.kind === 'deterministic') {
			const second = await runner.evaluate(structuredClone(input) as EvaluationInput, deps());
			if (JSON.stringify(first) !== JSON.stringify(second)) {
				issues.push({
					check: 'evaluator.deterministic',
					message: `"${evaluator.id}" is deterministic but returned different results for the same input`
				});
			}
		}
	}

	if (fixture.plantedSecret !== '' && JSON.stringify(results).includes(fixture.plantedSecret)) {
		issues.push({
			check: 'evaluator.no-secret-leaks',
			message: `"${evaluator.id}" let the credential into a result`
		});
	}

	return issues;
}
