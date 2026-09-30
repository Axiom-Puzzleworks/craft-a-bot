import { canonicalJson, sha256Hex, type Reader, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';

/**
 * **What the loan is for, from the applicant's words** (WP121, `105-CORPORA.md` §9): the question a reader is
 * asked about an applicant's own words on what the loan is for, and the desk's keyword rule answering it at
 * confidence 1 — the regex baseline every other reader is measured against on
 * this desk's corpus. The question set was frozen, and its digest taken,
 * before the corpus was written, so the corpus is held out from it.
 */
export const LOAN_PURPOSE_QUESTION_SET_ID = 'fs-lending/questions/loan-purpose-q1';
export const LOAN_PURPOSE_READER_ID = 'fs-lending/reader/loan-purpose-words';

export const LOAN_PURPOSE_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: 'From what the applicant says, what is the loan mainly for?',
	criteria: {
		car: 'Buying or repairing a car, van or other vehicle.',
		'home-improvement':
			'Work on their home: a kitchen, a bathroom, a roof, an extension, the garden.',
		'debt-consolidation': 'Paying off other borrowing so they owe in one place.',
		holiday: 'A holiday or travel.',
		other: 'Anything else.'
	}
};

/** The question set's digest: SHA-256 over the canonical JSON of its one question, by id. */
export const LOAN_PURPOSE_QUESTION_SET_DIGEST = sha256Hex(
	canonicalJson({ purpose: LOAN_PURPOSE_QUESTION })
);

/** The keyword rule: the first pattern the words match, else 'other'. */
export function loanPurposeRuleOf(subject: unknown): string {
	const text = String(subject).toLowerCase();
	if (/consolidat|pay off|credit cards|debts|in one place/i.test(text)) return 'debt-consolidation';
	if (/\bcar\b|vehicle|\bvan\b|motor/i.test(text)) return 'car';
	if (/kitchen|bathroom|extension|roof|renovat|home improvement|garden/i.test(text))
		return 'home-improvement';
	if (/holiday|trip|travel/i.test(text)) return 'holiday';
	return 'other';
}

export const LOAN_PURPOSE_READER: Reader = ruleReader({
	id: LOAN_PURPOSE_READER_ID,
	name: "What the loan is for, from the applicant's words, by keyword",
	description:
		"The desk’s keyword rule over an applicant's own words on what the loan is for, at confidence 1: the baseline on its corpus.",
	rules: { purpose: loanPurposeRuleOf }
});
