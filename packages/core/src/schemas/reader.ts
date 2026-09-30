import { z } from 'zod';

/**
 * **Typed questions and their answers** (WP117, `104-READERS.md` §3;
 * `100-TARGET-DESIGN-V7.md` §6.3, D16, tenet 35): a judgment as a question
 * with a type — a choice over keyed options, a noul (a probability that
 * something is so), a score over ordered levels — and an answer with a
 * distribution a gate can read. TypeSafe's three types (`98-JEV.md` §2),
 * adopted as the product's so a regex, a hosted classifier and a chat model
 * answer the same question in the same shape. The schema is the type: an
 * answer crosses a boundary every time `reader.answered` is written.
 */
const json = z.unknown();

export const choiceQuestionSchema = z.object({
	type: z.literal('choice'),
	instructions: json,
	/** The options, keyed; 2–255 of them. */
	criteria: z.record(z.string(), json).refine((criteria) => {
		const n = Object.keys(criteria).length;
		return n >= 2 && n <= 255;
	}, 'a choice has 2–255 options')
});
export const noulQuestionSchema = z.object({
	type: z.literal('noul'),
	instructions: json,
	criteria: z.object({ true: json.optional(), false: json.optional() }).optional()
});
export const scoreQuestionSchema = z.object({
	type: z.literal('score'),
	instructions: json,
	/** The ordered levels, lowest first; 2–10 of them. */
	criteria: z.array(json).min(2).max(10)
});
export const typedQuestionSchema = z.discriminatedUnion('type', [
	choiceQuestionSchema,
	noulQuestionSchema,
	scoreQuestionSchema
]);
export type TypedQuestion = z.infer<typeof typedQuestionSchema>;
export type QuestionType = TypedQuestion['type'];

const probability = z.number().min(0).max(1);
/** `null` when the reader returned no distribution (an argmax read, WP120): below every threshold. */
const confidence = probability.nullable();

export const choiceAnswerSchema = z.object({
	type: z.literal('choice'),
	choice: z.string(),
	probabilities: z.record(z.string(), probability),
	confidence
});
export const noulAnswerSchema = z.object({
	type: z.literal('noul'),
	/** P(true). A noul has no confidence: it is itself a probability. */
	noul: probability
});
export const scoreAnswerSchema = z.object({
	type: z.literal('score'),
	/** The level's index into the question's `criteria`. */
	score: z.number().int().nonnegative(),
	probabilities: z.array(probability),
	confidence
});
export const typedAnswerSchema = z.discriminatedUnion('type', [
	choiceAnswerSchema,
	noulAnswerSchema,
	scoreAnswerSchema
]);
export type TypedAnswer = z.infer<typeof typedAnswerSchema>;

export const readerMethodSchema = z.enum([
	'rule',
	'hosted',
	'constrained',
	'logprobs',
	'argmax',
	'human'
]);
export type ReaderMethod = z.infer<typeof readerMethodSchema>;

/** What a reader returns: who answered, how, and one answer per question asked. */
export const readerResponseSchema = z.object({
	/** What answered — `rule`, `jev-1.13.0`, `openai/gpt-4o-mini`. */
	model: z.string().min(1),
	method: readerMethodSchema,
	answers: z.record(z.string(), typedAnswerSchema)
});
export type ReaderResponse = z.infer<typeof readerResponseSchema>;

/**
 * What a `reader` stage records (`StageRecord.reader`) and says
 * (`reader.answered`): the reader, the answers as rounded, the confidence the
 * gate read, whether it gated, and the steer when one was asked.
 */
export const readerRecordSchema = z.object({
	readerId: z.string().min(1),
	model: z.string().min(1),
	method: readerMethodSchema,
	answers: z.record(z.string(), typedAnswerSchema),
	/** The lowest confidence over the choice and score answers; `null` when any is `null` or none was asked. */
	confidence,
	gated: z.boolean(),
	steer: probability.optional()
});
export type ReaderRecord = z.infer<typeof readerRecordSchema>;

/** The `docs/schemas/reader.schema.json` artefact: a question set and a response, as a cassette or a corpus row carries them. */
export const readerExchangeSchema = z.object({
	questions: z.record(z.string(), typedQuestionSchema),
	response: readerResponseSchema
});
export type ReaderExchange = z.infer<typeof readerExchangeSchema>;

/** Six places (`104-…` §3.2): below any threshold a person sets, and never a full double the synthetic sweep reads as a PAN. */
export function roundProbability(p: number): number {
	return Math.round(p * 1e6) / 1e6;
}

/**
 * **The confidence of a distribution** (`104-…` §3.2): `(n·p_max − 1)/(n − 1)`
 * — 0 at uniform, 1 with all the mass on one option — TypeSafe's formula,
 * adopted as the product's so a threshold is the same function of the
 * distribution whoever answered. Clamped to [0, 1] and rounded to six places.
 */
export function readerConfidence(probabilities: readonly number[]): number {
	const n = probabilities.length;
	if (n < 2) return 1;
	const max = Math.max(...probabilities);
	return roundProbability(Math.min(1, Math.max(0, (n * max - 1) / (n - 1))));
}

/**
 * An answer rounded to six places — its probabilities, and the confidence the
 * reader stated (`null` stays `null`). The confidence is kept, not recomputed
 * (WP120, `104-READERS.md` §3.2's note): a hosted reader computes it over its
 * own distribution before rounding the probabilities it sends, so the formula
 * over what it sent can land on the other side of a threshold (Jev: 0.90
 * stated, 0.8875 from its two-place probabilities). `checkReader` holds the
 * stated confidence to the formula within the probabilities' own precision.
 */
export function roundAnswer(answer: TypedAnswer): TypedAnswer {
	switch (answer.type) {
		case 'noul':
			return { type: 'noul', noul: roundProbability(answer.noul) };
		case 'choice': {
			const probabilities = Object.fromEntries(
				Object.entries(answer.probabilities).map(([key, p]) => [key, roundProbability(p)])
			);
			return {
				type: 'choice',
				choice: answer.choice,
				probabilities,
				confidence: answer.confidence === null ? null : roundProbability(answer.confidence)
			};
		}
		case 'score': {
			const probabilities = answer.probabilities.map(roundProbability);
			return {
				type: 'score',
				score: answer.score,
				probabilities,
				confidence: answer.confidence === null ? null : roundProbability(answer.confidence)
			};
		}
	}
}

/**
 * Why an answer does not answer its question, or `undefined`: the type
 * matches; a choice is one of the criteria and its distribution is over
 * exactly them; a score's level is in range and its distribution has one
 * entry per level; probabilities sum to 1 within the rounding.
 */
export function answerProblem(question: TypedQuestion, answer: TypedAnswer): string | undefined {
	if (answer.type !== question.type)
		return `a ${question.type} question answered as a ${answer.type}`;
	const sums = (ps: readonly number[]) => Math.abs(ps.reduce((a, b) => a + b, 0) - 1) <= 1e-4;
	if (question.type === 'choice' && answer.type === 'choice') {
		const keys = Object.keys(question.criteria);
		if (!keys.includes(answer.choice)) return `"${answer.choice}" is not one of the options`;
		const got = Object.keys(answer.probabilities);
		if (got.length !== keys.length || !keys.every((key) => got.includes(key)))
			return 'the probabilities are not over exactly the options';
		if (!sums(Object.values(answer.probabilities))) return 'the probabilities do not sum to 1';
	}
	if (question.type === 'score' && answer.type === 'score') {
		if (answer.score >= question.criteria.length) return `level ${answer.score} is out of range`;
		if (answer.probabilities.length !== question.criteria.length)
			return 'the probabilities are not one per level';
		if (!sums(answer.probabilities)) return 'the probabilities do not sum to 1';
	}
	return undefined;
}
