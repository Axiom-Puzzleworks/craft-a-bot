import type { Executor, Reader, ReaderGate, TypedQuestion, WorldState } from '@craftabot/core';
import { DESK_READER_LINE } from '@craftabot/pack-fs-bank';
import { ruleReader } from '@craftabot/governance';
import type { ComplaintsDeskState } from './desk.js';
import type { RootCause } from './extra.js';
import { rootCauseOf } from './workflow.js';

/**
 * **The Complaints Desk's rule reader** (WP117, `104-READERS.md` §7): the root
 * cause from the complaint as the register logged it, as a typed question the
 * register's own mapping answers at confidence 1. Shown the logged category
 * and nothing else. The shipped configurations keep the rule; fitting this
 * changes no outcome (`readers.test.ts`).
 */
export const ROOT_CAUSE_READER_ID = 'fs-advice/reader/root-cause';

export const ROOT_CAUSE_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: 'What caused this complaint, from how the register logged it?',
	criteria: {
		charges: 'The bank charged the customer wrongly, or mishandled their data.',
		advice: 'The advice the customer was given did not suit them.',
		service: 'The bank’s service fell short.',
		'no-error': 'The bank made no error.'
	} satisfies Record<RootCause, string>
};

export const COMPLAINTS_READERS: Reader[] = [
	ruleReader({
		id: ROOT_CAUSE_READER_ID,
		name: 'The root cause, by the register’s rule',
		description:
			'The register’s mapping from a complaint’s logged category to its root cause (`rootCauseOf`), at confidence 1.',
		rules: { cause: (subject) => rootCauseOf(String(subject)) }
	})
];

const categoryOf = (_input: unknown, state: WorldState): string =>
	(state as ComplaintsDeskState).extra.complaints.category;

/** A reader at `root-cause`: the cause read off the logged category and found on the desk, as `root-cause-v1` does. */
export function rootCauseReaderExecutor(
	readerId = ROOT_CAUSE_READER_ID,
	gate?: ReaderGate
): Executor {
	return {
		kind: 'reader',
		...(gate ? { gate } : {}),
		readerId,
		subject: categoryOf,
		questions: () => ({ cause: ROOT_CAUSE_QUESTION }),
		output: (answers) => {
			const answer = answers['cause'];
			return { cause: answer?.type === 'choice' ? answer.choice : undefined };
		},
		act: (output) => ({
			name: 'find-root-cause',
			arguments: { cause: (output as { cause: RootCause }).cause }
		})
	};
}

/** The rule reader fitted where the rule was. */
export const COMPLAINTS_RULE_READERS: Record<'root-cause', Executor> = {
	'root-cause': rootCauseReaderExecutor()
};

/** The gated reader the shipped configurations fit (WP138): the rule reader behind the desk's line, the rule as its `else`. */
export const COMPLAINTS_GATED_READERS: Record<'root-cause', Executor> = {
	'root-cause': rootCauseReaderExecutor(ROOT_CAUSE_READER_ID, {
		threshold: DESK_READER_LINE,
		else: { kind: 'rule', rule: 'root-cause-v1' }
	})
};
