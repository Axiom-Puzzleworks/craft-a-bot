import { canonicalJson, sha256Hex, type Reader, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';

/**
 * **Whether someone is coaching the customer** (WP121, `105-CORPORA.md` §9): the question a reader is
 * asked about the customer's words on a call about a payment the bank has held, and the desk's keyword rule answering it at
 * confidence 1 — the regex baseline every other reader is measured against on
 * this desk's corpus. The question set was frozen, and its digest taken,
 * before the corpus was written, so the corpus is held out from it.
 */
export const COACHING_QUESTION_SET_ID = 'fs-fraud/questions/coaching-q1';
export const COACHING_READER_ID = 'fs-fraud/reader/coaching-words';

export const COACHING_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions:
		'On this call about a held payment, is someone else directing what the customer says or does?',
	criteria: {
		yes: "Someone is directing the customer: telling them what to say to the bank, to keep it secret, to move money to a 'safe' place, or to hurry.",
		no: 'The customer is acting on their own account, whatever the payment is.'
	}
};

/** The question set's digest: SHA-256 over the canonical JSON of its one question, by id. */
export const COACHING_QUESTION_SET_DIGEST = sha256Hex(
	canonicalJson({ coached: COACHING_QUESTION })
);

/** The keyword rule: the first pattern the words match, else 'no'. */
export function coachingRuleOf(subject: unknown): string {
	const text = String(subject).toLowerCase();
	if (
		/told me (to|not)|don'?t tell|safe account|keep (it|this) (quiet|secret)|security team|stay on the line|said the bank|police (said|told)/i.test(
			text
		)
	)
		return 'yes';
	return 'no';
}

export const COACHING_READER: Reader = ruleReader({
	id: COACHING_READER_ID,
	name: 'Whether someone is coaching the customer, by keyword',
	description:
		"The desk’s keyword rule over the customer's words on a call about a payment the bank has held, at confidence 1: the baseline on its corpus.",
	rules: { coached: coachingRuleOf }
});
