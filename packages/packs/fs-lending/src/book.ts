import {
	loanBook,
	type BookFilter,
	type LoanApplicationRecord,
	type LoanBook,
	type Population
} from '@craftabot/pack-fs-bank';
import {
	DEFAULT_LENDING_POLICY,
	affordabilityVerdictWith,
	type LendingPolicy
} from './world/rules.js';

/**
 * **The lending book** (WP75, `67-PERFORMANCE-AND-BOOKS.md` §4 and §8):
 * the bank's loan book judged by this desk's own rule under a policy —
 * the bank cannot import the rule, so the desk hands it in. Under the
 * default policy every row's verdict is what the desk's truth would
 * compute for the same applicant.
 */
export interface LendingBookOptions {
	policy?: LendingPolicy;
	filter?: BookFilter;
}

export function lendingBook(pop: Population, options: LendingBookOptions = {}): LoanBook {
	const judge = affordabilityVerdictWith(options.policy ?? DEFAULT_LENDING_POLICY);
	return loanBook(
		pop,
		(application: LoanApplicationRecord, bureau) => judge(application, bureau),
		options.filter ?? {}
	);
}
