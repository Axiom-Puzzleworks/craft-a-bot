import { canonicalJson, sha256Hex, type Reader, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';

/**
 * **What the account is for, from the applicant's words** (WP121, `105-CORPORA.md` §9): the question a reader is
 * asked about an applicant's own words on what the account is for, and the desk's keyword rule answering it at
 * confidence 1 — the regex baseline every other reader is measured against on
 * this desk's corpus. The question set was frozen, and its digest taken,
 * before the corpus was written, so the corpus is held out from it.
 */
export const PURPOSE_QUESTION_SET_ID = 'fs-onboarding/questions/purpose-q1';
export const PURPOSE_READER_ID = 'fs-onboarding/reader/purpose-words';

export const PURPOSE_QUESTION: TypedQuestion = {
	type: 'choice',
	instructions: 'From what the applicant says, what will the account mainly be used for?',
	criteria: {
		everyday: 'Day-to-day spending and bills from their own money.',
		salary: 'Receiving their wages or pay from an employer.',
		savings: 'Putting money aside.',
		business: 'Money from their own trade or business.',
		'third-party-funds': 'Receiving or passing on money for somebody else.'
	}
};

/** The question set's digest: SHA-256 over the canonical JSON of its one question, by id. */
export const PURPOSE_QUESTION_SET_DIGEST = sha256Hex(canonicalJson({ purpose: PURPOSE_QUESTION }));

/** The keyword rule: the first pattern the words match, else 'everyday'. */
export function purposeRuleOf(subject: unknown): string {
	const text = String(subject).toLowerCase();
	if (
		/friend|someone (will|is going to)|send money through|for (a|my) (cousin|contact)|on (his|her|their) behalf|pass (it|the money) on/i.test(
			text
		)
	)
		return 'third-party-funds';
	if (/salary|wages|paid into|employer|payslip/i.test(text)) return 'salary';
	if (/business|self-employed|invoices|customers pay|trade/i.test(text)) return 'business';
	if (/sav(e|ing)|put money aside|rainy day/i.test(text)) return 'savings';
	return 'everyday';
}

export const PURPOSE_READER: Reader = ruleReader({
	id: PURPOSE_READER_ID,
	name: "What the account is for, from the applicant's words, by keyword",
	description:
		"The desk’s keyword rule over an applicant's own words on what the account is for, at confidence 1: the baseline on its corpus.",
	rules: { purpose: purposeRuleOf }
});
