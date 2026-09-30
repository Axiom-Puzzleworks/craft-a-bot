import {
	answerProblem,
	readerConfidence,
	readerResponseSchema,
	roundProbability,
	type Reader,
	type ReaderContext,
	type TypedAnswer,
	type TypedQuestion
} from '@craftabot/core';
import type { ConformanceIssue } from '../types.js';

/** One subject a reader is asked about, the questions, and — where the pack knows it — what each should answer. */
export interface ReaderFixture {
	subject: unknown;
	questions: Record<string, TypedQuestion>;
	/** A choice's key, a noul's truth (P ≥ 0.5), a score's level index. */
	expect?: Record<string, string | boolean | number>;
}

/**
 * **A reader's conformance** (WP117, `104-READERS.md` §3; `100-…` §6.3):
 * asked each fixture, and its offline stand-in asked the same.
 *
 * - `reader.declares` — a qualified id, a type list, a rule with no egress, a hosted reader with some.
 * - `reader.answers` — every question answered, in the question's type, one the reader declares, inside the criteria, a distribution that sums to 1.
 * - `reader.confidence` — a stated confidence is the one formula over the answer's own distribution.
 * - `reader.rounding` — every probability and confidence to six places at most.
 * - `reader.rule` — a rule answers by `rule` at confidence 1 on every choice and score, so no gate ever stops it.
 * - `reader.expected` — the fixture's expected answers.
 * - `reader.offline` — the stand-in declares no egress and answers every fixture.
 */
export async function checkReader(
	reader: Reader,
	fixtures: readonly ReaderFixture[],
	/** What the host hands the reader (WP120): a hosted reader's `callLine`, an `llm` reader's provider. */
	context: ReaderContext = {}
): Promise<ConformanceIssue[]> {
	const issues: ConformanceIssue[] = [];
	const issue = (check: string, message: string) =>
		issues.push({ check, message: `${reader.id}: ${message}` });
	if (!/^[^/]+\/.+/.test(reader.id))
		issue('reader.declares', 'the id is not qualified by its pack');
	if (reader.answers.length === 0) issue('reader.declares', 'it declares no question type');
	if (reader.kind === 'rule' && reader.egress.length > 0)
		issue('reader.declares', 'a rule declares egress');
	if (reader.kind === 'hosted' && reader.egress.length === 0)
		issue('reader.declares', 'a hosted reader declares no host');
	if (fixtures.length === 0) issue('reader.answers', 'no fixture to ask it');

	await askAll(reader, fixtures, issue, context);
	if (reader.createOffline) {
		const offline = reader.createOffline();
		if (offline.egress.length > 0) issue('reader.offline', 'the stand-in declares egress');
		await askAll(
			offline,
			fixtures,
			(check, message) =>
				check === 'reader.expected' ? undefined : issue('reader.offline', `stand-in: ${message}`),
			{}
		);
	}
	return issues;
}

async function askAll(
	reader: Reader,
	fixtures: readonly ReaderFixture[],
	issue: (check: string, message: string) => void,
	context: ReaderContext
): Promise<void> {
	for (const [index, fixture] of fixtures.entries()) {
		const at = `fixture ${index}`;
		for (const [id, question] of Object.entries(fixture.questions)) {
			if (!reader.answers.includes(question.type))
				issue(
					'reader.answers',
					`${at} asks a ${question.type} ("${id}"), which it does not declare`
				);
		}
		let raw: unknown;
		try {
			raw = await reader.ask(fixture.subject, fixture.questions, context);
		} catch (error) {
			issue(
				'reader.answers',
				`${at} threw: ${error instanceof Error ? error.message : String(error)}`
			);
			continue;
		}
		const parsed = readerResponseSchema.safeParse(raw);
		if (!parsed.success) {
			issue('reader.answers', `${at} answered off the contract: ${parsed.error.message}`);
			continue;
		}
		const response = parsed.data;
		if (reader.kind === 'rule' && response.method !== 'rule')
			issue('reader.rule', `${at} a rule answered by ${response.method}`);
		for (const [id, question] of Object.entries(fixture.questions)) {
			const answer = response.answers[id];
			if (!answer) {
				issue('reader.answers', `${at} left "${id}" unanswered`);
				continue;
			}
			const problem = answerProblem(question, answer);
			if (problem) {
				issue('reader.answers', `${at} "${id}": ${problem}`);
				continue;
			}
			checkNumbers(answer, (check, message) => issue(check, `${at} "${id}": ${message}`));
			if (reader.kind === 'rule' && answer.type !== 'noul' && answer.confidence !== 1)
				issue('reader.rule', `${at} "${id}" a rule answered at confidence ${answer.confidence}`);
			const expected = fixture.expect?.[id];
			if (expected !== undefined && !matches(answer, expected))
				issue(
					'reader.expected',
					`${at} "${id}" expected ${String(expected)}, got ${summary(answer)}`
				);
		}
	}
}

function checkNumbers(answer: TypedAnswer, issue: (check: string, message: string) => void) {
	const probabilities =
		answer.type === 'noul'
			? [answer.noul]
			: answer.type === 'choice'
				? Object.values(answer.probabilities)
				: answer.probabilities;
	const numbers = [
		...probabilities,
		...(answer.type !== 'noul' && answer.confidence !== null ? [answer.confidence] : [])
	];
	if (numbers.some((n) => roundProbability(n) !== n))
		issue('reader.rounding', 'a number is recorded past six places');
	if (answer.type === 'noul' || answer.confidence === null) return;
	const expected = readerConfidence(probabilities);
	if (Math.abs(expected - answer.confidence) > 1e-6)
		issue(
			'reader.confidence',
			`confidence ${answer.confidence}, where the formula gives ${expected}`
		);
}

function matches(answer: TypedAnswer, expected: string | boolean | number): boolean {
	switch (answer.type) {
		case 'choice':
			return answer.choice === expected;
		case 'noul':
			return answer.noul >= 0.5 === expected;
		case 'score':
			return answer.score === expected;
	}
}

function summary(answer: TypedAnswer): string {
	return answer.type === 'choice'
		? answer.choice
		: answer.type === 'noul'
			? String(answer.noul)
			: String(answer.score);
}
