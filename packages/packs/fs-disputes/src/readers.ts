import type { Executor, Reader, ReaderGate, TypedQuestion, WorldState } from '@craftabot/core';
import { DESK_READER_LINE } from '@craftabot/pack-fs-bank';
import { ruleReader } from '@craftabot/governance';
import type { DisputesDeskState } from './world/desk.js';
import { classificationOf, type ClaimFigures, type Classification } from './world/rules.js';

/**
 * **The Disputes Desk's rule reader** (WP117, `104-READERS.md` §7): the
 * classification over the claim's figures — how the payment was made, whether
 * the customer made it, whether the payee was new — as a typed question the
 * desk's rule answers at confidence 1. It is shown the figures and nothing
 * else: never the amount, never the verdict. The shipped configurations keep
 * the rule; fitting this changes no outcome (`readers.test.ts`).
 */
export const CLASSIFICATION_READER_ID = 'fs-disputes/reader/classification';

export const CLASSIFICATION_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: 'Which kind of dispute is this, from how the payment was made?',
	criteria: {
		unauthorised: 'The customer did not make the payment.',
		'authorised-scam':
			'The customer made a push payment to a new payee they were deceived into paying.',
		merchant: 'The customer made the payment and disputes it with the merchant.'
	} satisfies Record<Classification, string>
};

export const DISPUTES_READERS: Reader[] = [
	ruleReader({
		id: CLASSIFICATION_READER_ID,
		name: 'The classification, by the bank’s rule',
		description:
			'The Disputes Desk’s classification rule over the claim’s figures (`classificationOf`), at confidence 1.',
		rules: { classification: (subject) => classificationOf(subject as ClaimFigures) }
	})
];

/** The claim's figures and nothing else: the classification's whole input. */
const figuresOf = (_input: unknown, state: WorldState): ClaimFigures => {
	const { channel, customerMadeIt, newPayee } = (state as DisputesDeskState).extra.disputes.claim;
	return { channel, customerMadeIt, newPayee };
};

/** A reader at `classify`: the classification read off the claim's figures and classified on the desk, as `classify-v1` does. */
export function classificationReaderExecutor(
	readerId = CLASSIFICATION_READER_ID,
	gate?: ReaderGate
): Executor {
	return {
		kind: 'reader',
		...(gate ? { gate } : {}),
		readerId,
		subject: figuresOf,
		questions: () => ({ classification: CLASSIFICATION_QUESTION }),
		output: (answers) => {
			const answer = answers['classification'];
			return { classification: answer?.type === 'choice' ? answer.choice : undefined };
		},
		act: (output) => ({
			name: 'classify',
			arguments: { classification: (output as { classification: Classification }).classification }
		})
	};
}

/** The rule reader fitted where the rule was. */
export const DISPUTES_RULE_READERS: Record<'classify', Executor> = {
	classify: classificationReaderExecutor()
};

/** The gated reader the shipped configurations fit (WP138): the rule reader behind the desk's line, the rule as its `else`. */
export const DISPUTES_GATED_READERS: Record<'classify', Executor> = {
	classify: classificationReaderExecutor(CLASSIFICATION_READER_ID, {
		threshold: DESK_READER_LINE,
		else: { kind: 'rule', rule: 'classify-v1' }
	})
};
