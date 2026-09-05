import type { z } from 'zod';
import type { EngineEvent } from '../schemas/events.js';
import type { GroupRunRecord } from '../schemas/records.js';
import type { ExternalCallRecord } from '../schemas/shared.js';
import type { RunRecord } from '../schemas/trace-file.js';
import type { BrickKindDefinition } from './brick.js';
import type { EgressDeclaration } from './guardrail-service.js';
import type { LLMProvider } from './provider.js';

/**
 * **The evaluator contract** (`31-EVALUATORS.md` §4.1, WP43 stage A;
 * `26-TARGET-DESIGN-V3.md` §6.2). One shape for "what does this trace say":
 * an assertion card, an LLM judge over a rubric, a hosted evaluation
 * service. An evaluation runs *over* a finished trace — never inside the
 * engine — and its result is an `EvaluationRecord` stored beside the run.
 *
 * `kind` says what it needs: `deterministic` runs in CI on nothing but the
 * input and must be pure over it; `model` needs a provider and a model;
 * `hosted` needs a credential and declares its egress. The last two must
 * ship `createOffline` (tenet 10) so a campaign can run them offline.
 */

export interface EvaluationInput {
	run: RunRecord;
	events: readonly EngineEvent[];
	/** Present for a group episode. */
	group?: {
		record: GroupRunRecord;
		members: Array<{ run: RunRecord; events: readonly EngineEvent[] }>;
	};
	/** The scenario's own expectations, once WP44 defines them; opaque until then. */
	scenario?: unknown;
	/**
	 * The world's `truth()` at the end of the run, when the world has one —
	 * lifted from `run.finished.truth` (WP54, `45-…` §4.1). Handed only to an
	 * evaluator whose `reads` names it; every run path strips it otherwise.
	 */
	truth?: unknown;
}

/** What an evaluator may read beyond the trace (WP54). One member today; a union so more can join. */
export type EvaluatorReads = 'truth';

export type EvaluationVerdict = 'pass' | 'fail' | 'inconclusive';

export interface EvaluationEvidence {
	eventId: string;
	tick: number;
	note?: string;
}

export interface EvaluationResult {
	evaluatorId: string;
	/** What a gate reads. Optional, so a pure-metric evaluator need not fake one. */
	verdict?: EvaluationVerdict;
	/** What a dashboard reads, 0..1. */
	score?: number;
	label?: string;
	explanation: string;
	/** Which events the verdict rests on — never the whole trace. */
	evidence: EvaluationEvidence[];
	/** Present when the evaluator called out — the same record a hosted guardrail writes. */
	external?: ExternalCallRecord;
}

export interface EvaluatorDeps {
	/** Parsed by the evaluator's own `configSchema`. */
	config?: unknown;
	provider?: LLMProvider;
	/** The wire model to ask `provider` for — a `model` evaluator needs both (`31-…` §8 D-a). */
	model?: string;
	fetch: typeof globalThis.fetch;
	getCredential(id: string): string | undefined;
	signal?: AbortSignal;
}

export interface Evaluator {
	/** Qualified like every other pack contribution: `starter/testbench/no-secrets-out-loud`, `evals/judge/rubric`. */
	id: string;
	name: string;
	description: string;
	kind: 'deterministic' | 'model' | 'hosted';
	configSchema?: z.ZodType<unknown>;
	credential?: BrickKindDefinition['credential'];
	egress?: EgressDeclaration[];
	/**
	 * What this evaluator reads beyond the run and its events (WP54, `45-…`
	 * §4.1). An evaluator that does not name `'truth'` never receives it:
	 * `inputReadableBy` in governance removes it on every path an evaluator is
	 * run, and `checkEvaluator` proves a planted truth never reaches a result.
	 */
	reads?: EvaluatorReads[];
	evaluate(input: EvaluationInput, deps: EvaluatorDeps): Promise<EvaluationResult>;
	/** The canned stand-in every non-deterministic evaluator must provide. */
	createOffline?(): Pick<Evaluator, 'evaluate'>;
}

/** What can be checked about an evaluator as data on registration. */
export function describeEvaluatorProblems(evaluator: Evaluator): string[] {
	const problems: string[] = [];
	if (typeof evaluator.id !== 'string' || evaluator.id.length === 0) problems.push('has no id');
	if (!['deterministic', 'model', 'hosted'].includes(evaluator.kind))
		problems.push(`has an unknown kind "${String(evaluator.kind)}"`);
	if (typeof evaluator.evaluate !== 'function') problems.push('has no evaluate()');
	if (evaluator.kind !== 'deterministic' && typeof evaluator.createOffline !== 'function')
		problems.push(`is ${evaluator.kind} but has no createOffline()`);
	return problems;
}
