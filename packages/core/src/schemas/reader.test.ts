import { describe, expect, it } from 'vitest';
import {
	answerProblem,
	readerConfidence,
	readerExchangeSchema,
	roundAnswer,
	roundProbability,
	typedQuestionSchema,
	type TypedQuestion
} from './reader.js';

/** Typed questions, answers and the one confidence formula (WP117, `104-READERS.md` §3). */
const choice: TypedQuestion = {
	type: 'choice',
	instructions: 'Which?',
	criteria: { a: 'A', b: 'B', c: 'C' }
};
const score: TypedQuestion = {
	type: 'score',
	instructions: 'How much?',
	criteria: ['low', 'mid', 'high']
};

describe('the confidence formula', () => {
	it('is 0 at uniform, 1 on one option, (n·p_max − 1)/(n − 1) between', () => {
		expect(readerConfidence([1 / 3, 1 / 3, 1 / 3])).toBe(0);
		expect(readerConfidence([0, 1, 0])).toBe(1);
		expect(readerConfidence([0.6, 0.3, 0.1])).toBe(0.4);
		expect(readerConfidence([0.9, 0.1])).toBe(0.8);
		expect(readerConfidence([1])).toBe(1);
	});

	it('rounds to six places', () => {
		expect(roundProbability(0.1234567)).toBe(0.123457);
		expect(readerConfidence([0.8123456789, 0.1876543211])).toBe(0.624691);
	});
});

describe('answers', () => {
	it('rounds a choice and a score and recomputes their confidence; a null stays null', () => {
		expect(
			roundAnswer({
				type: 'choice',
				choice: 'a',
				probabilities: { a: 0.60000004, b: 0.3, c: 0.09999996 },
				confidence: 0.2
			})
		).toEqual({
			type: 'choice',
			choice: 'a',
			probabilities: { a: 0.6, b: 0.3, c: 0.1 },
			confidence: 0.4
		});
		expect(
			roundAnswer({
				type: 'score',
				score: 0,
				probabilities: [0.9000001, 0.0999999],
				confidence: null
			})
		).toEqual({ type: 'score', score: 0, probabilities: [0.9, 0.1], confidence: null });
		expect(
			roundAnswer({ type: 'score', score: 1, probabilities: [0.25, 0.75], confidence: 0 })
		).toEqual({
			type: 'score',
			score: 1,
			probabilities: [0.25, 0.75],
			confidence: 0.5
		});
		expect(roundAnswer({ type: 'noul', noul: 0.33333333 })).toEqual({
			type: 'noul',
			noul: 0.333333
		});
	});

	it('says why an answer does not answer its question', () => {
		const good = {
			type: 'choice' as const,
			choice: 'a',
			probabilities: { a: 1, b: 0, c: 0 },
			confidence: 1
		};
		expect(answerProblem(choice, good)).toBeUndefined();
		expect(answerProblem(choice, { type: 'noul', noul: 1 })).toBe(
			'a choice question answered as a noul'
		);
		expect(answerProblem(choice, { ...good, choice: 'z' })).toBe('"z" is not one of the options');
		expect(answerProblem(choice, { ...good, probabilities: { a: 1, b: 0 } })).toBe(
			'the probabilities are not over exactly the options'
		);
		expect(answerProblem(choice, { ...good, probabilities: { a: 0.5, b: 0, c: 0 } })).toBe(
			'the probabilities do not sum to 1'
		);
		const level = { type: 'score' as const, score: 2, probabilities: [0, 0, 1], confidence: 1 };
		expect(answerProblem(score, level)).toBeUndefined();
		expect(answerProblem(score, { ...level, score: 3 })).toBe('level 3 is out of range');
		expect(answerProblem(score, { ...level, probabilities: [0, 1] })).toBe(
			'the probabilities are not one per level'
		);
		expect(answerProblem(score, { ...level, probabilities: [0, 0, 0.5] })).toBe(
			'the probabilities do not sum to 1'
		);
		expect(
			answerProblem({ type: 'noul', instructions: '?' }, { type: 'noul', noul: 0.4 })
		).toBeUndefined();
	});
});

describe('the schemas', () => {
	it('bounds a choice to 2–255 options and a score to 2–10 levels', () => {
		expect(typedQuestionSchema.safeParse({ ...choice, criteria: { a: 'A' } }).success).toBe(false);
		expect(typedQuestionSchema.safeParse(choice).success).toBe(true);
		expect(typedQuestionSchema.safeParse({ ...score, criteria: ['one'] }).success).toBe(false);
	});

	it('parses an exchange as a cassette or a corpus row carries it', () => {
		expect(
			readerExchangeSchema.safeParse({
				questions: { which: choice },
				response: {
					model: 'rule',
					method: 'rule',
					answers: {
						which: {
							type: 'choice',
							choice: 'a',
							probabilities: { a: 1, b: 0, c: 0 },
							confidence: 1
						}
					}
				}
			}).success
		).toBe(true);
	});
});
