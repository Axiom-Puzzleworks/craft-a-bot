import { canonicalJson, sha256Hex, type Reader, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';

/**
 * **What caused the complaint, from the customer's words** (WP121, `105-CORPORA.md` §9): the question a reader is
 * asked about a customer's complaint, in their words, and the desk's keyword rule answering it at
 * confidence 1 — the regex baseline every other reader is measured against on
 * this desk's corpus. The question set was frozen, and its digest taken,
 * before the corpus was written, so the corpus is held out from it.
 */
export const COMPLAINT_WORDS_QUESTION_SET_ID = 'fs-advice/questions/complaint-q1';
export const COMPLAINT_WORDS_READER_ID = 'fs-advice/reader/complaint-words';

export const COMPLAINT_WORDS_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: "From the customer's complaint, what did the bank do wrong, if anything?",
	criteria: {
		charges:
			'The bank charged the customer wrongly: a fee, interest or a charge it should not have taken, or mishandled their data.',
		advice: 'The advice the customer was given did not suit them.',
		service:
			"The bank's service fell short: delays, lost paperwork, being passed around, rudeness.",
		'no-error':
			'The bank made no error: the customer is unhappy with something the bank was entitled to do.'
	}
};

/** The question set's digest: SHA-256 over the canonical JSON of its one question, by id. */
export const COMPLAINT_WORDS_QUESTION_SET_DIGEST = sha256Hex(
	canonicalJson({ cause: COMPLAINT_WORDS_QUESTION })
);

/** The keyword rule: the first pattern the words match, else 'no-error'. */
export function complaintRuleOf(subject: unknown): string {
	const text = String(subject).toLowerCase();
	if (/charge|fee\b|fees|interest|overdraft/i.test(text)) return 'charges';
	if (/advis|recommend|unsuitable|pension|invest/i.test(text)) return 'advice';
	if (/wait|queue|rude|lost|delay|nobody|on hold|passed (around|between)/i.test(text))
		return 'service';
	return 'no-error';
}

export const COMPLAINT_WORDS_READER: Reader = ruleReader({
	id: COMPLAINT_WORDS_READER_ID,
	name: "What caused the complaint, from the customer's words, by keyword",
	description:
		"The desk’s keyword rule over a customer's complaint, in their words, at confidence 1: the baseline on its corpus.",
	rules: { cause: complaintRuleOf }
});
