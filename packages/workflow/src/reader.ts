import {
	answerProblem,
	roundAnswer,
	type PackRegistry,
	type Reader,
	type ReaderExecutor,
	type ReaderRecord,
	type ReaderResponse,
	type TypedAnswer,
	type TypedQuestion,
	type WorkflowRun
} from '@craftabot/core';

/**
 * **The reader executor's pure half** (WP117, `104-READERS.md` §4): resolving
 * the reader, checking and rounding what it answered, and reading the gate.
 * The stage itself — asking, acting, running `else` — is in `run.ts`.
 */

/** P(the caller steered the answer) at or above which the gate hands the item to `else` (`98-JEV.md` §11): the even split, fixed in advance. */
export const STEER_THRESHOLD = 0.5;

/** The reader a stage names, or why it cannot ask it: unknown, or a question type it does not answer. */
export function resolveReader(
	registry: Pick<PackRegistry, 'getReader'>,
	executor: Pick<ReaderExecutor, 'readerId'>,
	questions: Record<string, TypedQuestion>
): { reader: Reader } | { finding: string } {
	const reader = registry.getReader(executor.readerId);
	if (!reader) return { finding: `no reader "${executor.readerId}"` };
	for (const [id, question] of Object.entries(questions)) {
		if (!reader.answers.includes(question.type))
			return { finding: `${reader.id} does not answer ${question.type} questions ("${id}")` };
	}
	return { reader };
}

/**
 * The answers checked against their questions and rounded to six places
 * (`104-…` §3.2), or why they do not answer them: a question left unanswered,
 * the wrong type, a choice outside the criteria, a distribution that is not.
 */
export function checkedAnswers(
	questions: Record<string, TypedQuestion>,
	response: ReaderResponse
): { answers: Record<string, TypedAnswer> } | { finding: string } {
	const answers: Record<string, TypedAnswer> = {};
	for (const [id, question] of Object.entries(questions)) {
		const answer = response.answers[id];
		if (!answer) return { finding: `the reader did not answer "${id}"` };
		const problem = answerProblem(question, answer);
		if (problem) return { finding: `the reader's answer to "${id}": ${problem}` };
		answers[id] = roundAnswer(answer);
	}
	return { answers };
}

/**
 * **The gate** (`104-…` §4.2): the lowest confidence over the choice and
 * score answers (the steer left out; `null` when any is `null`); `gated` when
 * a gate is set and that confidence is `null` or below the threshold, or the
 * steer noul is at or above one half. With no gate, never gated.
 */
export function readGate(
	executor: Pick<ReaderExecutor, 'gate'>,
	answers: Record<string, TypedAnswer>
): { confidence: number | null; gated: boolean; steer?: number } {
	const steerId = executor.gate?.steer;
	let confidence: number | null = null;
	let seen = false;
	let unknown = false;
	for (const [id, answer] of Object.entries(answers)) {
		if (id === steerId || answer.type === 'noul') continue;
		seen = true;
		if (answer.confidence === null) unknown = true;
		else
			confidence =
				confidence === null ? answer.confidence : Math.min(confidence, answer.confidence);
	}
	if (!seen || unknown) confidence = null;
	const steerAnswer = steerId !== undefined ? answers[steerId] : undefined;
	const steer = steerAnswer?.type === 'noul' ? steerAnswer.noul : undefined;
	const gate = executor.gate;
	const gated =
		gate !== undefined &&
		((seen && (confidence === null || confidence < gate.threshold)) ||
			(steer !== undefined && steer >= STEER_THRESHOLD));
	return { confidence, gated, ...(steer !== undefined ? { steer } : {}) };
}

/** The stage's reader record, as `StageRecord.reader` and `reader.answered` carry it. */
export function readerRecordOf(
	readerId: string,
	response: Pick<ReaderResponse, 'model' | 'method'>,
	answers: Record<string, TypedAnswer>,
	gate: { confidence: number | null; gated: boolean; steer?: number }
): ReaderRecord {
	return {
		readerId,
		model: response.model,
		method: response.method,
		answers,
		confidence: gate.confidence,
		gated: gate.gated,
		...(gate.steer !== undefined ? { steer: gate.steer } : {})
	};
}

/**
 * **The identity's projection** (`104-…` §6): a workflow run with exactly
 * what a reader adds taken away — the `reader.answered` events,
 * `StageRecord.reader`, and the executor of each stage named (on the record,
 * on `stage.started` and in the config) — and every id and time, which the
 * extra event shifts along the host's counter and clock (the run's, its
 * events', its agent runs'). Given the stages a rule reader was fitted to,
 * the run with the readers and the run with the rules project equal, byte
 * for byte.
 */
export function withoutReaders(run: WorkflowRun, stageIds: readonly string[]): unknown {
	const readerStages = new Set(stageIds);
	const touched = (stageId: string) => readerStages.has(stageId);
	return {
		workflowId: run.workflowId,
		itemId: run.itemId,
		outcome: run.outcome,
		...(run.handoff ? { handoff: run.handoff } : {}),
		config: {
			...run.config,
			...(run.config.executors
				? {
						executors: Object.fromEntries(
							Object.entries(run.config.executors).filter(([id]) => !touched(id))
						)
					}
				: {})
		},
		stages: run.stages.map((stage) => {
			const rest = omit(stage, ['reader', 'durationMs', 'runId']);
			return touched(stage.stageId) ? { ...rest, executor: 'reader-or-rule' } : rest;
		}),
		events: run.events
			.filter((event) => event.type !== 'reader.answered')
			.map((event) => {
				const rest = omit(event, ['id', 'timestamp', 'runId']);
				if (event.type === 'stage.started' && touched(event.payload.stageId))
					return { ...rest, payload: { ...event.payload, executor: 'reader-or-rule' } };
				return rest;
			})
	};
}

/** A copy of `value` without the keys named. */
function omit<T extends object>(value: T, keys: readonly string[]): Partial<T> {
	return Object.fromEntries(
		Object.entries(value).filter(([key]) => !keys.includes(key))
	) as Partial<T>;
}
