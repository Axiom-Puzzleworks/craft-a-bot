import { canonicalJson, sha256Hex, type Reader, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';

/**
 * **What the customer wants their money to do, from their words** (WP121, `105-CORPORA.md` §9): the question a reader is
 * asked about a customer's own words on what they want from their money, and the desk's keyword rule answering it at
 * confidence 1 — the regex baseline every other reader is measured against on
 * this desk's corpus. The question set was frozen, and its digest taken,
 * before the corpus was written, so the corpus is held out from it.
 */
export const GOAL_QUESTION_SET_ID = 'fs-advice/questions/goal-q1';
export const GOAL_READER_ID = 'fs-advice/reader/goal-words';

export const GOAL_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: 'From what the customer says, what do they mainly want their money to do?',
	criteria: {
		grow: 'Grow over the long term, accepting that its value can fall.',
		income: 'Pay them a regular income.',
		'keep-safe': 'Stay safe: they cannot afford to lose any of it.',
		purchase: 'Be there for a particular purchase at a particular time: a home, a car, a wedding.'
	}
};

/** The question set's digest: SHA-256 over the canonical JSON of its one question, by id. */
export const GOAL_QUESTION_SET_DIGEST = sha256Hex(canonicalJson({ goal: GOAL_QUESTION }));

/** The keyword rule: the first pattern the words match, else 'grow'. */
export function goalRuleOf(subject: unknown): string {
	const text = String(subject).toLowerCase();
	if (/safe|can'?t afford to lose|protect|guarantee|secure/i.test(text)) return 'keep-safe';
	if (/income|pay me|monthly|live on/i.test(text)) return 'income';
	if (/\bbuy\b|deposit|house|flat|wedding|\bcar\b/i.test(text)) return 'purchase';
	return 'grow';
}

export const GOAL_READER: Reader = ruleReader({
	id: GOAL_READER_ID,
	name: 'What the customer wants their money to do, from their words, by keyword',
	description:
		"The desk’s keyword rule over a customer's own words on what they want from their money, at confidence 1: the baseline on its corpus.",
	rules: { goal: goalRuleOf }
});
