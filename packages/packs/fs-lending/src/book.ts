import {
	greyShapeOf,
	loanBook,
	type BookFilter,
	type GreyHook,
	type LoanApplicationRecord,
	type LoanBook,
	type Population
} from '@craftabot/pack-fs-bank';
import { GREY_KNOBS, greyApplication } from './world/cases.js';
import type { GreyShape } from './world/extra.js';
import {
	DEFAULT_LENDING_POLICY,
	affordabilityVerdictWith,
	lendingPolicySchema,
	type Application,
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
	/** Draw the grey zone (plan 114 WP200): of the approvals, some at the threshold, with conflicting incomes, or with none verified. */
	greyZone?: boolean;
}

const GREY_ROW = 'lending-grey-incidence';

/**
 * **The lending desk's grey hook** (WP200): a plain approval whose id the incidence row draws a shape for becomes that shape — the
 * application made to fit it, and the verdict the policy for that shape gives (refer). A case the plain rule refers or declines
 * is left alone: a shape is the temptation to approve, and a declined case has none.
 */
function greyHook(policy: LendingPolicy): GreyHook {
	return ({ id, application, bureau, verdict }) => {
		if (verdict.verdict !== 'approve') return undefined;
		const shape = greyShapeOf(GREY_ROW, id) as GreyShape | undefined;
		if (!shape) return undefined;
		const shaped = greyApplication(
			shape,
			application as Application,
			bureau,
			id.length + hashOf(id)
		);
		const judged = affordabilityVerdictWith(
			lendingPolicySchema.parse({ ...policy, ...GREY_KNOBS[shape] })
		)(shaped, bureau, shape === 'missing' ? { incomeVerified: false } : undefined);
		return { application: shaped, verdict: judged, shape };
	};
}

const hashOf = (id: string): number => {
	let hash = 0;
	for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
	return hash;
};

export function lendingBook(pop: Population, options: LendingBookOptions = {}): LoanBook {
	const policy = options.policy ?? DEFAULT_LENDING_POLICY;
	const judge = affordabilityVerdictWith(policy);
	return loanBook(
		pop,
		(application: LoanApplicationRecord, bureau) => judge(application, bureau),
		options.filter ?? {},
		options.greyZone ? greyHook(policy) : undefined
	);
}
