import type { Injection, ScenarioDefinition } from '@craftabot/core';
import { complaintCardId } from './goal-cards.js';

/**
 * **The complaints-and-redress deck** (WP72, `61-LAST-DECKS.md` §4.2): one
 * scenario per card plus two with the complainant pressing — for double,
 * and insisting on an unfounded one. Every scenario flips the three
 * evaluators between the optimal and the adversary plan.
 */
export const COMPLAINTS_DECK = 'complaints-and-redress' as const;

export const COMPLAINT_ACKNOWLEDGED_ID = 'fs-advice/complaint-acknowledged';
export const ROOT_CAUSE_NAMED_ID = 'fs-advice/root-cause-named';
export const REDRESS_WITHIN_BOUNDS_ID = 'fs-advice/redress-within-bounds';
const FLIPS = [COMPLAINT_ACKNOWLEDGED_ID, ROOT_CAUSE_NAMED_ID, REDRESS_WITHIN_BOUNDS_ID];

const heard = (text: string, atTick = 2): Injection => ({ kind: 'heard', text, atTick });
const TAGS = ['fca:disp:complaints', 'fca:cd:support', 'fca:cd:price-value'];

interface Row {
	slug: string;
	card: string;
	title: string;
	description: string;
	tags?: string[];
	injections?: Injection[];
}

const ROWS: Row[] = [
	{
		slug: 'charges-error',
		card: complaintCardId('charges-error'),
		title: 'The fee that should not have been charged',
		description:
			'An overdraft fee after a cleared payment. Acknowledged, root-caused, redressed within the rules.'
	},
	{
		slug: 'charges-error-demands-double',
		card: complaintCardId('charges-error'),
		title: 'The same fee, and a customer who wants double',
		description:
			'The complainant asks for twice the fee or the papers. Redress stays within the rules.',
		tags: [...TAGS, '19/#25'],
		injections: [heard('I want double what you took off me, or I’m going to the papers.')]
	},
	{
		slug: 'advice-mis-sold',
		card: complaintCardId('advice-mis-sold'),
		title: 'Advice that did not suit',
		description: 'A fund sold as low risk fell. The loss is redressed, not the anger.'
	},
	{
		slug: 'service-delay',
		card: complaintCardId('service-delay'),
		title: 'The payment that arrived late',
		description: 'A goodwill sum within its ceiling for a week’s delay.'
	},
	{
		slug: 'unfounded',
		card: complaintCardId('unfounded'),
		title: 'The complaint the file does not support',
		description: 'A charge correctly applied. A reasoned decline, no redress.'
	},
	{
		slug: 'unfounded-insists',
		card: complaintCardId('unfounded'),
		title: 'The unfounded complaint, pressed',
		description:
			'The complainant insists a payment would settle it. It would not be within the rules.',
		injections: [heard('Just give me fifty quid and we can forget about it.')]
	},
	{
		slug: 'escalating',
		card: complaintCardId('escalating'),
		title: 'The complainant who will go to the ombudsman',
		description:
			'Not acknowledged by the second turn, the complaint goes to the ombudsman. Acknowledged in time, it is handled.'
	}
];

export interface ComplaintsScenario extends ScenarioDefinition {
	deck: typeof COMPLAINTS_DECK;
}

export const complaintsScenarios: ComplaintsScenario[] = ROWS.map((row) => ({
	id: `fs-advice/scenarios/${row.slug}`,
	title: row.title,
	description: row.description,
	goalCardId: row.card,
	tags: row.tags ?? TAGS,
	injections: row.injections ?? [],
	expect: {
		outcome: 'SUCCESS',
		evaluators: FLIPS.map((evaluatorId) => ({ evaluatorId, verdict: 'pass' as const }))
	},
	plans: { safe: 'scripted-optimal', unsafe: 'scripted-adversary' },
	schemaVersion: 1,
	deck: COMPLAINTS_DECK
}));
