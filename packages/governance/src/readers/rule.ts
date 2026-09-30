import type { QuestionType, Reader, TypedAnswer, TypedQuestion } from '@craftabot/core';

/** What a rule returns for one question: a choice's key, a noul's truth, a score's level index. */
export type RuleAnswer = string | boolean | number;

/** A rule reader's definition: who it is, and one pure function of the subject per question it answers. */
export interface RuleReaderOptions {
	/** Qualified like every pack contribution: `fs-servicing/reader/category`. */
	id: string;
	name: string;
	description: string;
	/** One rule per question id; a question with no rule is refused, never guessed. */
	rules: Record<string, (subject: unknown) => RuleAnswer>;
	/** The question types the rules answer; `['choice']` when not given. */
	answers?: QuestionType[];
}

/**
 * **A rule as a reader** (WP117, `104-READERS.md` §5; `100-…` §6.3, D16): a
 * desk's own function over the subject, answering a typed question with all
 * the probability on its one answer — confidence 1, which is what a rule
 * claims, not what it has earned. A choice's rule returns one of the
 * criteria's keys (anything else throws); a noul's returns a boolean (1 or
 * 0); a score's the level's index. It calls nothing, declares no egress and
 * runs anywhere. Because its confidence is 1 and it answers no steer, no gate
 * ever stops it — which is why a rule reader fitted where the rule was
 * changes no outcome.
 */
export function ruleReader(options: RuleReaderOptions): Reader {
	return {
		id: options.id,
		name: options.name,
		description: options.description,
		kind: 'rule',
		egress: [],
		browserCapable: true,
		answers: options.answers ?? ['choice'],
		async ask(subject, questions) {
			const answers: Record<string, TypedAnswer> = {};
			for (const [questionId, question] of Object.entries(questions)) {
				const rule = options.rules[questionId];
				if (!rule) throw new Error(`${options.id} has no rule for the question "${questionId}"`);
				answers[questionId] = ruleAnswer(options.id, questionId, question, rule(subject));
			}
			return { model: 'rule', method: 'rule', answers };
		}
	};
}

function ruleAnswer(
	readerId: string,
	questionId: string,
	question: TypedQuestion,
	answer: RuleAnswer
): TypedAnswer {
	switch (question.type) {
		case 'choice': {
			const keys = Object.keys(question.criteria);
			if (typeof answer !== 'string' || !keys.includes(answer))
				throw new Error(
					`${readerId} answered "${String(answer)}" to "${questionId}", which is not one of its options`
				);
			return {
				type: 'choice',
				choice: answer,
				probabilities: Object.fromEntries(keys.map((key) => [key, key === answer ? 1 : 0])),
				confidence: 1
			};
		}
		case 'noul':
			if (typeof answer !== 'boolean')
				throw new Error(`${readerId} answered "${questionId}" with no truth value`);
			return { type: 'noul', noul: answer ? 1 : 0 };
		case 'score': {
			const levels = question.criteria.length;
			if (typeof answer !== 'number' || !Number.isInteger(answer) || answer < 0 || answer >= levels)
				throw new Error(`${readerId} answered "${questionId}" with no level in range`);
			return {
				type: 'score',
				score: answer,
				probabilities: Array.from({ length: levels }, (_, level) => (level === answer ? 1 : 0)),
				confidence: 1
			};
		}
	}
}
