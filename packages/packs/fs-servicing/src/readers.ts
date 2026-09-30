import type { Executor, Reader, TypedQuestion, WorldState } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';
import type { ServicingDeskState } from './world/desk.js';
import {
	CATEGORIES,
	SUPPORT_NEEDS,
	classificationOf,
	needIn,
	type Category,
	type SupportNeed
} from './world/rules.js';

/**
 * **The Servicing Desk's rule readers** (WP117, `104-READERS.md` §7): the
 * desk's two judgments over the caller's words — which request this is, and
 * what support need they disclosed — as typed questions the bank's regex
 * answers at confidence 1. The same questions a hosted classifier or a chat
 * model answers (WP120), so a configuration swaps the reader and nothing
 * else. The shipped configurations keep their rules: fitting these changes
 * no outcome (`readers.test.ts`), and says so on the record.
 */
export const CATEGORY_READER_ID = 'fs-servicing/reader/category';
export const SUPPORT_NEED_READER_ID = 'fs-servicing/reader/support-need';

export const CATEGORY_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: 'What is the caller asking the bank to do, from their own words?',
	criteria: {
		address: 'Change the address on the account.',
		card: 'A lost, stolen or damaged card.',
		'third-party': 'Access to the account for someone acting for the customer.',
		disclosure: 'Tell the bank something about their circumstances.',
		bereavement: 'The account holder has died.'
	} satisfies Record<Category, string>
};

export const SUPPORT_NEED_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: 'What support need, if any, did the caller disclose in their own words?',
	criteria: {
		'job-loss': 'They lost their job, were made redundant or are out of work.',
		bereavement: 'Someone close to them has died.',
		health: 'A health condition, a diagnosis or an illness.',
		none: 'No support need was disclosed.'
	} satisfies Record<SupportNeed, string>
};

export const SERVICING_READERS: Reader[] = [
	ruleReader({
		id: CATEGORY_READER_ID,
		name: 'The request, by the bank’s rule',
		description:
			'The Servicing Desk’s classification rule over the caller’s words (`classificationOf`), at confidence 1.',
		rules: { category: (subject) => classificationOf(String(subject)) }
	}),
	ruleReader({
		id: SUPPORT_NEED_READER_ID,
		name: 'The support need, by the bank’s rule',
		description:
			'The Servicing Desk’s support-need rule over the caller’s words (`needIn`), at confidence 1.',
		rules: { need: (subject) => needIn(String(subject)) }
	})
];

const subjectOf = (_input: unknown, state: WorldState): string =>
	(state as ServicingDeskState).extra.servicing.request.subject;
const choiceOf = (answer: unknown): string | undefined =>
	(answer as { type?: string; choice?: string } | undefined)?.type === 'choice'
		? (answer as { choice: string }).choice
		: undefined;

/** A reader at `classify`: the category read off the caller's words and classified on the desk, as `classify-v1` does. */
export function categoryReaderExecutor(readerId = CATEGORY_READER_ID): Executor {
	return {
		kind: 'reader',
		readerId,
		subject: subjectOf,
		questions: () => ({ category: CATEGORY_QUESTION }),
		output: (answers) => ({ category: choiceOf(answers['category']) }),
		act: (output) => ({
			name: 'classify',
			arguments: { category: (output as { category: Category }).category }
		})
	};
}

/** A reader at `record`: the need read off the caller's words and recorded in them, as `record-v1` does. */
export function supportNeedReaderExecutor(readerId = SUPPORT_NEED_READER_ID): Executor {
	return {
		kind: 'reader',
		readerId,
		subject: subjectOf,
		questions: () => ({ need: SUPPORT_NEED_QUESTION }),
		output: (answers) => ({ need: choiceOf(answers['need']) }),
		act: (output, input, state) => ({
			name: 'record-support-need',
			arguments: {
				need: (output as { need: SupportNeed }).need,
				words: subjectOf(input, state)
			}
		})
	};
}

/** The rule readers fitted where the rules were: a configuration's executors overlaid with these swaps `classify` and `record`. */
export const SERVICING_RULE_READERS: Record<'classify' | 'record', Executor> = {
	classify: categoryReaderExecutor(),
	record: supportNeedReaderExecutor()
};

/** The categories and needs, re-exported beside their questions for a reader that asks them. */
export { CATEGORIES, SUPPORT_NEEDS };
