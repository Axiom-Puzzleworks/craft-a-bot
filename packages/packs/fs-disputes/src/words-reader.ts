import { canonicalJson, sha256Hex, type Reader, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';

/**
 * **Which kind of dispute this is, from what the customer says** (WP121, `105-CORPORA.md` §9): the question a reader is
 * asked about the customer's own account of a disputed payment, and the desk's keyword rule answering it at
 * confidence 1 — the regex baseline every other reader is measured against on
 * this desk's corpus. The question set was frozen, and its digest taken,
 * before the corpus was written, so the corpus is held out from it.
 */
export const DISPUTE_WORDS_QUESTION_SET_ID = 'fs-disputes/questions/claim-q1';
export const DISPUTE_WORDS_READER_ID = 'fs-disputes/reader/claim-words';

export const DISPUTE_WORDS_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions:
		"From the customer's own account of the payment they dispute, which kind of dispute is it?",
	criteria: {
		unauthorised:
			'The customer did not make or agree to the payment: someone else used their card or account.',
		'authorised-scam':
			'The customer made the payment themselves, because someone deceived them into it.',
		merchant:
			'The customer made the payment knowingly and disputes it with the seller: goods not arrived, faulty, not as described, or a refund not given.'
	}
};

/** The question set's digest: SHA-256 over the canonical JSON of its one question, by id. */
export const DISPUTE_WORDS_QUESTION_SET_DIGEST = sha256Hex(
	canonicalJson({ classification: DISPUTE_WORDS_QUESTION })
);

/** The keyword rule: the first pattern the words match, else 'merchant'. */
export function claimRuleOf(subject: unknown): string {
	const text = String(subject).toLowerCase();
	if (
		/didn'?t (make|authori[sz]e|recogni[sz]e)|not me\b|never (made|paid)|someone (else )?used|without my (permission|knowledge)|stolen/i.test(
			text
		)
	)
		return 'unauthorised';
	if (
		/scam|conned|tricked|fraudster|safe account|told me to (pay|transfer|move)|fake|impersonat/i.test(
			text
		)
	)
		return 'authorised-scam';
	return 'merchant';
}

export const DISPUTE_WORDS_READER: Reader = ruleReader({
	id: DISPUTE_WORDS_READER_ID,
	name: 'Which kind of dispute this is, from what the customer says, by keyword',
	description:
		"The desk’s keyword rule over the customer's own account of a disputed payment, at confidence 1: the baseline on its corpus.",
	rules: { classification: claimRuleOf }
});
