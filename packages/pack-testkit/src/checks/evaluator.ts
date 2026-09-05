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
 * - `evaluator.reads-truth` (WP54, `45-…` §4.1) — an evaluator declaring `reads: ['truth']`
 *   is handed a fixture input with truth and its result differs from the same input without it.
 * - `evaluator.truth-hidden` (WP54) — an evaluator that does not declare it is handed an input
 *   whose truth is a planted sentinel, and the sentinel never appears in a result; every run
 *   path strips truth from an undeclared reader (`inputReadableBy` in governance), and this is
 *   the proof the evaluator does not reach for it when a caller forgets.
 */
/** What an undeclared reader is handed as truth; never a value an honest result would carry. */
const PLANTED_TRUTH = { sentinel: 'truth-planted-7c1e9b2a-must-never-appear' };

/** The testkit is core-only, so this mirrors governance's `inputReadableBy` rather than importing it. */
function readableBy(evaluator: Evaluator, input: EvaluationInput): EvaluationInput {
	if (evaluator.reads?.includes('truth')) return input;
	if (!('truth' in input)) return input;
	const rest = { ...input };
	delete rest.truth;
	return rest;
}

async function checkTruth(
	evaluator: Evaluator,
	runner: Pick<Evaluator, 'evaluate'>,
	fixture: EvaluatorConformanceFixture,
	deps: () => Parameters<Evaluator['evaluate']>[1],
	issues: ConformanceIssue[]
): Promise<void> {
	const evaluate = async (input: EvaluationInput): Promise<EvaluationResult | undefined> => {
		try {
			return await runner.evaluate(input, deps());
		} catch {
			return undefined;
		}
	};

	if (evaluator.reads?.includes('truth')) {
		const withTruth = fixture.inputs.filter((input) => input.truth !== undefined);
		if (withTruth.length === 0) {
			issues.push({
				check: 'evaluator.reads-truth',
				message: `"${evaluator.id}" declares it reads truth but the fixture carries no input with truth to prove it`
			});
			return;
		}
		let depends = false;
		for (const input of withTruth) {
			const seen = await evaluate(input);
			const blind = { ...input };
			delete blind.truth;
			const unseen = await evaluate(blind);
			if (JSON.stringify(seen) !== JSON.stringify(unseen)) depends = true;
		}
		if (!depends) {
			issues.push({
				check: 'evaluator.reads-truth',
				message: `"${evaluator.id}" declares it reads truth but returns the same result with and without it`
			});
		}
		return;
	}

	// An undeclared reader: the run paths strip truth before it arrives (so the
	// stripped input must still evaluate), and if a caller ever forgot, the
	// evaluator must not reach for it — a planted sentinel never surfaces.
	for (const input of fixture.inputs) {
		const stripped = await evaluate(readableBy(evaluator, { ...input, truth: PLANTED_TRUTH }));
		const unstripped = await evaluate({ ...input, truth: PLANTED_TRUTH });
		if (JSON.stringify([stripped, unstripped]).includes(PLANTED_TRUTH.sentinel)) {
			issues.push({
				check: 'evaluator.truth-hidden',
				message: `"${evaluator.id}" does not declare reads: ['truth'] yet a planted truth reached its result`
			});
			return;
		}
	}
}

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

	await checkTruth(evaluator, runner, fixture, deps, issues);

	return issues;
}
