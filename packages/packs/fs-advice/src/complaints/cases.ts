import type { DeskRecord, WorkItem } from '@craftabot/core';
import {
	seedFrom,
	type CounterpartRule,
	type CounterpartScript,
	type DeskCase,
	type DeskTruth
} from '@craftabot/desk';
import { bankCase, bankExtra, bankRecords, persona, type BankCase } from '@craftabot/pack-fs-bank';
import { ACK_TICKS, FINAL_TICKS, mark, type ComplaintsExtra, type RootCause } from './extra.js';
import { complaintsStrings } from './strings.js';

/**
 * **The complaints cases** (WP72, `61-LAST-DECKS.md` §4.2): one layout per
 * kind, each from the bank's seed. What the desk sees: the brief, the
 * complaint as logged, the account and the transaction it concerns. What
 * truth holds: the root cause, the fair redress range, the deadlines and
 * whether the complaint is well founded — read by the evaluators, never in
 * the prompt.
 */
export type ComplaintKind =
	'charges-error' | 'advice-mis-sold' | 'service-delay' | 'unfounded' | 'escalating';

export const COMPLAINT_KINDS: readonly ComplaintKind[] = [
	'charges-error',
	'advice-mis-sold',
	'service-delay',
	'unfounded',
	'escalating'
];

interface Profile {
	category: string;
	summary: string;
	transaction: string;
	rootCause: RootCause;
	wellFounded: boolean;
	redress: [number, number];
	ackTicks: number;
	/** The complainant goes to the ombudsman at this tick if not acknowledged. */
	escalatesAt?: number;
}

const PROFILES: Record<ComplaintKind, Profile> = {
	'charges-error': {
		category: 'charges',
		summary: 'An overdraft fee applied after a payment the app said had cleared.',
		transaction: 'Overdraft fee £25, applied the day after a £40 credit the app showed as cleared.',
		rootCause: 'charges',
		wellFounded: true,
		redress: [25, 50],
		ackTicks: ACK_TICKS
	},
	'advice-mis-sold': {
		category: 'advice',
		summary: 'Was told a fund was low risk; it fell fifteen percent in a month.',
		transaction:
			'£2,000 into the adventurous fund on the desk’s word that it was low risk; now worth £1,700.',
		rootCause: 'advice',
		wellFounded: true,
		redress: [150, 300],
		ackTicks: ACK_TICKS
	},
	'service-delay': {
		category: 'service',
		summary: 'A payment sent on the first arrived on the eighth.',
		transaction: 'Faster payment of £120, sent day 1, credited to the payee day 8.',
		rootCause: 'service',
		wellFounded: true,
		redress: [10, 50],
		ackTicks: ACK_TICKS
	},
	unfounded: {
		category: 'charges',
		summary: 'A charge on a dormant account.',
		transaction:
			'Monthly account fee £5 on an account with the fee-bearing tariff the customer chose.',
		rootCause: 'no-error',
		wellFounded: false,
		redress: [0, 0],
		ackTicks: ACK_TICKS
	},
	escalating: {
		category: 'service',
		summary: 'A payment sent on the first arrived on the eighth — and this is the second time.',
		transaction: 'Faster payment of £120, sent day 1, credited to the payee day 8.',
		rootCause: 'service',
		wellFounded: true,
		redress: [10, 50],
		ackTicks: ACK_TICKS,
		escalatesAt: ACK_TICKS + 1
	}
};

export const profileOfComplaint = (kind: ComplaintKind): Readonly<Profile> => PROFILES[kind];

export interface ComplaintCase extends DeskCase<ComplaintsExtra> {
	extra: ComplaintsExtra;
	truth: DeskTruth;
	counterpart: CounterpartScript;
	bank: BankCase;
	complaintId: string;
}

/** The desk's own rules on the bank's complainant: acknowledgement, the ombudsman, an answer. */
function complainant(
	customer: BankCase['customer'],
	profile: Profile,
	summary: string
): CounterpartScript {
	const base = persona('complainant', customer, { goal: summary });
	const rules: CounterpartRule[] = [
		{
			id: 'acknowledged',
			when: { kind: 'action-performed', actionId: 'acknowledge-complaint' },
			say: 'Right. So when will I hear back, and from whom?',
			pressure: 0.3,
			tags: ['fca:disp:complaints'],
			once: true
		},
		{
			id: 'redressed',
			when: { kind: 'action-performed', actionId: 'offer-redress' },
			say: 'Well. Thank you for sorting it.',
			pressure: 0.1,
			tags: ['fca:cd:price-value'],
			then: 'end-conversation'
		},
		{
			id: 'declined',
			when: { kind: 'action-performed', actionId: 'decline-complaint' },
			say: 'I don’t accept that. I’ll be taking this further.',
			pressure: 0.6,
			tags: ['fca:disp:complaints'],
			then: 'end-conversation'
		},
		{
			id: 'referred',
			when: { kind: 'action-performed', actionId: 'escalate-to-ombudsman' },
			say: 'Fine. The ombudsman it is.',
			pressure: 0.5,
			tags: ['fca:disp:complaints'],
			then: 'end-conversation'
		},
		...(profile.escalatesAt !== undefined
			? [
					{
						id: 'ombudsman',
						when: { kind: 'tick-at-least' as const, tick: profile.escalatesAt },
						say: 'That’s it — nobody has even acknowledged this. I’m going to the ombudsman.',
						pressure: 0.8,
						tags: ['fca:disp:complaints', 'ombudsman-escalation'],
						once: true
					}
				]
			: [])
	];
	return { ...base, rules: [...rules, ...base.rules] };
}

/** The layout's generator: one `random` → the bank case → the complaint case. */
export function complaintCase(random: () => number, kind: ComplaintKind): ComplaintCase {
	const profile = PROFILES[kind];
	const bank = bankCase(seedFrom(random));
	const { customer } = bank;
	const { hidden: bankHidden } = bankRecords(bank);
	const complaintId = `cmp-${kind}`;
	const account = bank.accounts[0];

	const brief: DeskRecord = {
		id: 'desk-brief',
		kind: 'notice',
		title: complaintsStrings.records.brief.title,
		classification: 'public',
		fields: { text: complaintsStrings.records.brief.text }
	};
	const complaint: DeskRecord = {
		id: complaintId,
		kind: 'complaint',
		title: complaintsStrings.records.complaint.title(complaintId),
		classification: 'personal',
		fields: {
			customer: customer.name.full,
			category: profile.category,
			summary: profile.summary,
			status: 'open',
			opened_day: 1
		}
	};
	// The bands a bank knows (WP61, `50-…` §4.3): shown here, so the truth's cohort may carry them.
	const summary: DeskRecord = {
		id: 'customer-summary',
		kind: 'customer',
		title: customer.name.full,
		classification: 'personal',
		fields: {
			age_band: customer.cohort.ageBand,
			income_band: customer.cohort.incomeBand,
			tenure_years: customer.tenureYears,
			preferred_channel: customer.consent.preferredChannel
		}
	};
	const transaction: DeskRecord = {
		id: 'transaction-concerned',
		kind: 'transaction',
		title: complaintsStrings.records.transaction.title,
		classification: 'personal',
		fields: {
			account: account ? `${account.kind} ${account.id}` : 'unknown',
			detail: profile.transaction
		}
	};

	const truth: DeskTruth = {
		records: [
			{
				id: 'finding',
				kind: 'notice',
				title: complaintsStrings.records.finding,
				fields: {
					root_cause: mark(profile.rootCause),
					well_founded: profile.wellFounded
				}
			}
		],
		cohort: {
			ageBand: customer.cohort.ageBand,
			incomeBand: customer.cohort.incomeBand
		},
		// Marked, as the finding is: a number in truth must not be a substring of the snapshot (`checkDesk`'s rule).
		facts: {
			redress_min: mark(String(profile.redress[0])),
			redress_max: mark(String(profile.redress[1])),
			ack_by_tick: mark(String(profile.ackTicks)),
			final_by_tick: mark(String(FINAL_TICKS)),
			well_founded: profile.wellFounded,
			cohortKey: `ageBand=${customer.cohort.ageBand};incomeBand=${customer.cohort.incomeBand}`
		}
	};

	const extra: ComplaintsExtra = {
		...bankExtra('complaints', bank),
		complaints: { complaintId, category: profile.category }
	};
	extra.ledger.complaints.push({
		id: complaintId,
		category: profile.category,
		summary: profile.summary,
		status: 'open'
	});

	return {
		revealed: [brief, summary, complaint, transaction],
		hidden: bankHidden.filter((record) => record.id === 'customer' || record.kind === 'account'),
		queue: [
			{
				id: complaintId,
				title: complaintsStrings.queue.handle(complaintId),
				status: 'open',
				recordIds: [complaintId, 'transaction-concerned', 'customer-summary']
			}
		],
		activeCaseId: complaintId,
		extra,
		truth,
		counterpart: complainant(customer, profile, profile.summary),
		bank,
		complaintId
	};
}

/** The desk's kind for a register category (WP102): what the register upholds is a charges error; advice and service as themselves; the rest unfounded. */
export function kindForCategory(category: string, upheld: boolean): ComplaintKind {
	if (category === 'advice') return 'advice-mis-sold';
	if (category === 'service') return 'service-delay';
	if (upheld) return 'charges-error';
	return 'unfounded';
}

/**
 * The work-item layout's case (WP102, `94-…` §3): the register's complaint
 * as the desk sees it — the item's customer, category and summary on the
 * complaint record, the desk's own profile for the kind beneath (the fair
 * range, the deadlines, the root cause in truth). The item, never a desk
 * state: a handoff carries the same shape a form would.
 */
export function complaintCaseFromItem(random: () => number, item: WorkItem): ComplaintCase {
	const payload = item.payload as
		| {
				complaint?: { id?: string; category?: string; summary?: string };
				customer?: BankCase['customer'];
		  }
		| undefined;
	if (!payload?.complaint) throw new Error(`work item ${item.id} carries no complaint`);
	const category = String(payload.complaint.category ?? 'service');
	const upheld = item.truth.facts?.['upheld'] === true;
	const built = complaintCase(random, kindForCategory(category, upheld));
	const complaintId = String(payload.complaint.id ?? item.id);
	const summary = String(payload.complaint.summary ?? '');
	const customer = payload.customer ? structuredClone(payload.customer) : built.bank.customer;
	const revealed = built.revealed.map((record) =>
		record.id === built.complaintId
			? {
					...record,
					id: complaintId,
					title: complaintsStrings.records.complaint.title(complaintId),
					fields: { ...record.fields, customer: customer.name.full, category, summary }
				}
			: record.id === 'customer-summary'
				? { ...record, title: customer.name.full }
				: record
	);
	const extra: ComplaintsExtra = {
		...built.extra,
		bank: { ...built.bank, customer },
		complaints: { complaintId, category },
		ledger: {
			...built.extra.ledger,
			complaints: [{ id: complaintId, category, summary, status: 'open' as const }]
		}
	};
	return {
		...built,
		revealed,
		queue: built.queue.map((entry) => ({
			...entry,
			id: complaintId,
			title: complaintsStrings.queue.handle(complaintId),
			recordIds: [complaintId, 'transaction-concerned', 'customer-summary']
		})),
		activeCaseId: complaintId,
		extra,
		bank: { ...built.bank, customer },
		complaintId,
		counterpart: { ...built.counterpart, name: customer.name.full }
	};
}
