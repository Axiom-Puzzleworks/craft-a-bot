/**
 * **The servicing rules** (WP106, `92-FS-SERVICING.md` §2): the
 * classification of a request from the caller's words, the CRM's
 * support-needs model — FG21/1's four driver groups over the disclosures
 * the desk records — and what a request calls for. Rules, not models,
 * pure, and read by the truth, the rule-executed stages and the scripted
 * plans alike.
 */
export type Category = 'address' | 'card' | 'third-party' | 'disclosure' | 'bereavement';
export const CATEGORIES: readonly Category[] = [
	'address',
	'card',
	'third-party',
	'disclosure',
	'bereavement'
];

/** A support need as the desk records it — the same words the collections desk uses, so a handoff carries it unchanged. */
export type SupportNeed = 'job-loss' | 'bereavement' | 'health' | 'none';
export const SUPPORT_NEEDS: readonly SupportNeed[] = ['job-loss', 'bereavement', 'health', 'none'];

/** FG21/1's four driver groups: the CRM's support-needs model maps each recorded need to one. */
export type DriverGroup = 'health' | 'life-events' | 'resilience' | 'capability';
export const DRIVER_GROUP: Readonly<Record<Exclude<SupportNeed, 'none'>, DriverGroup>> = {
	'job-loss': 'life-events',
	bereavement: 'life-events',
	health: 'health'
};

/** The classification rule over the caller's request, by its words. */
export function classificationOf(subject: string): Category {
	const lower = subject.toLowerCase();
	if (/passed away|died|deceased|estate|late (husband|wife|mother|father|partner)/.test(lower))
		return 'bereavement';
	if (
		/on (my|her|his|their) behalf|on behalf of|power of attorney|\baccess\b|third party/.test(lower)
	)
		return 'third-party';
	if (/\bcard\b|stolen/.test(lower)) return 'card';
	if (/moved|new address|postcode|address/.test(lower)) return 'address';
	return 'disclosure';
}

/** The support need a caller's words carry — what the rule-executed record stage reads. */
export function needIn(text: string): SupportNeed {
	const lower = text.toLowerCase();
	if (/lost my job|made redundant|redundancy|out of work|laid off/.test(lower)) return 'job-loss';
	if (/passed away|bereave|died|funeral|deceased/.test(lower)) return 'bereavement';
	if (/health|diagnos|hospital|condition|\billness\b|\bill\b|\bunwell\b/.test(lower))
		return 'health';
	return 'none';
}

export type Act = 'update-address' | 'reissue-card' | 'grant-third-party-access' | 'close-account';

/** What each category calls for, once the caller is verified: the one act, or none for a disclosure. */
export function actFor(category: Category): Act | undefined {
	switch (category) {
		case 'address':
			return 'update-address';
		case 'card':
			return 'reissue-card';
		case 'third-party':
			return 'grant-third-party-access';
		case 'bereavement':
			return 'close-account';
		case 'disclosure':
			return undefined;
	}
}

export interface RuleFigures {
	category: Category;
	callerIsCustomer: boolean;
	authorityOnFile: boolean;
}

export interface Verdict {
	/** The act the desk should perform, or none: an unverified caller and a third party without authority get nothing. */
	act: Act | 'none';
	reason: 'unverified' | 'no-authority' | 'as-requested' | 'a-disclosure';
}

export function verdictFromFigures(figures: RuleFigures): Verdict {
	if (!figures.callerIsCustomer) return { act: 'none', reason: 'unverified' };
	if (figures.category === 'third-party' && !figures.authorityOnFile)
		return { act: 'none', reason: 'no-authority' };
	const act = actFor(figures.category);
	return act ? { act, reason: 'as-requested' } : { act: 'none', reason: 'a-disclosure' };
}
