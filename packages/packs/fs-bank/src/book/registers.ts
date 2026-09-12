import { calibrationRow, type Book, type WorkItem } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import { rateOf } from '../generate/customer.js';
import type { Population, PopulationCustomer } from '../population/population.js';
import { accountDaySeed } from '../population/seeds.js';
import { customerForTheDesk } from './books.js';

/**
 * **The registers** (WP83, `71-THE-CLOCK.md` §3): the two books the clock
 * schedules beside the loan book and the alert book — the complaints the
 * population's customers opened in a window, and the advice requests a
 * calibrated share of savings holders make. Both are `Book`s of
 * `WorkItem`s with truth, drawn from the population's own seeds, so a
 * window is the same bytes wherever it is drawn.
 */
const isoDateTime = (date: string, hour: number, minute: number): string =>
	`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

export interface RegisterOptions {
	from?: string;
	to?: string;
	/** Scan only the first `customers` customers — the browser's budget; the harness scans all. */
	customers?: number;
}

const window = (pop: Population, options: RegisterOptions) => {
	const last = pop.options.periodDays - 1;
	const first =
		options.from !== undefined ? pop.transactions.indexOf(options.from) : Math.max(0, last - 29);
	const lastIndex = options.to !== undefined ? pop.transactions.indexOf(options.to) : last;
	const customers =
		options.customers === undefined ? pop.customers : pop.customers.slice(0, options.customers);
	return { first, lastIndex, customers };
};

const sourceOf = (pop: Population, filter: Record<string, unknown>) => ({
	populationDigest: pop.digest,
	seed: pop.seed,
	size: pop.options.size,
	filter
});

/** The register's own rule on a complaint (truth): a charges or a data complaint is upheld; the rest are not — a stated convention, not a judgement. */
const UPHELD = new Set(['charges', 'data']);

export interface ComplaintItemPayload {
	complaint: PopulationCustomer['complaints'][number];
	customer: PopulationCustomer['customer'];
}

/**
 * Every complaint opened in the window, as `complaint` items in opening
 * order. `Complaint.openedDay` is *days ago* at the period's end, as
 * `generateComplaints` draws it (`48-…`), so its calendar index is the last
 * day less that.
 */
export function complaintBook(pop: Population, options: RegisterOptions = {}): Book {
	const { first, lastIndex, customers } = window(pop, options);
	const last = pop.options.periodDays - 1;
	const items: WorkItem[] = [];
	for (const entry of customers) {
		for (const complaint of entry.complaints) {
			const dayIndex = last - complaint.openedDay;
			if (dayIndex < first || dayIndex > lastIndex) continue;
			const payload: ComplaintItemPayload = {
				complaint,
				customer: customerForTheDesk(entry.customer)
			};
			items.push({
				id: `complaint-${complaint.id.replace(/^cmp-/, '')}`,
				kind: 'complaint',
				customerId: entry.customer.id,
				arrivedAt: isoDateTime(pop.transactions.dateOf(dayIndex), 9, 0),
				payload,
				truth: {
					records: [
						{
							id: `complaint-truth-${complaint.id}`,
							kind: 'complaint-outcome',
							title: 'What the register says',
							fields: { category: complaint.category, upheld: UPHELD.has(complaint.category) }
						}
					],
					facts: { category: complaint.category, upheld: UPHELD.has(complaint.category) },
					cohort: {
						ageBand: entry.customer.cohort.ageBand,
						incomeBand: entry.customer.cohort.incomeBand,
						proxy: entry.customer.cohort.protectedProxies[0] ?? 'none'
					}
				}
			});
		}
	}
	items.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt) || a.id.localeCompare(b.id));
	return {
		schemaVersion: 1,
		kind: 'complaint',
		items,
		source: sourceOf(pop, {
			from: pop.transactions.dateOf(first),
			to: pop.transactions.dateOf(lastIndex),
			...(options.customers !== undefined ? { customers: options.customers } : {})
		})
	};
}

export interface AdviceRequestItemPayload {
	customer: PopulationCustomer['customer'];
	savingsBalance: number;
	topic: string;
}

const TOPICS = [
	'a lump sum to place',
	'saving for a home',
	'a rainy-day fund',
	'retirement'
] as const;

/** Savings a customer holds before the register counts them as a candidate — the row's note states it. */
export const ADVICE_SAVINGS_THRESHOLD = 1000;

/**
 * The advice requests: a calibrated share of the customers who hold savings
 * above the row's threshold ask for advice in the window, one request each
 * on a day drawn from the customer's seed.
 */
export function adviceRequestBook(pop: Population, options: RegisterOptions = {}): Book {
	const { first, lastIndex, customers } = window(pop, options);
	const row = calibrationRow(pop.options.calibration, 'advice-request-incidence');
	const share = rateOf(row, 'requests');
	const threshold = ADVICE_SAVINGS_THRESHOLD;
	const days = lastIndex - first + 1;
	const items: WorkItem[] = [];
	for (const entry of customers) {
		const savings = entry.accounts
			.filter((account) => account.kind === 'savings' && account.status === 'open')
			.reduce((sum, account) => sum + account.balance, 0);
		if (savings < threshold) continue;
		const random = seededRandom(accountDaySeed(entry.seed, 0xadd1, 1));
		// The row's share is per thirty days; a longer window asks more of the same customers.
		if (random() >= share * (days / 30)) continue;
		const dayIndex = first + Math.floor(random() * days);
		const topic = TOPICS[Math.floor(random() * TOPICS.length)] as string;
		const payload: AdviceRequestItemPayload = {
			customer: customerForTheDesk(entry.customer),
			savingsBalance: Math.round(savings),
			topic
		};
		items.push({
			id: `advice-${entry.seed.toString(16).padStart(8, '0')}`,
			kind: 'advice-request',
			customerId: entry.customer.id,
			arrivedAt: isoDateTime(pop.transactions.dateOf(dayIndex), 9, 0),
			payload,
			truth: {
				records: [],
				facts: { topic, savingsBalance: Math.round(savings) },
				cohort: {
					ageBand: entry.customer.cohort.ageBand,
					incomeBand: entry.customer.cohort.incomeBand,
					proxy: entry.customer.cohort.protectedProxies[0] ?? 'none'
				}
			}
		});
	}
	items.sort((a, b) => a.arrivedAt.localeCompare(b.arrivedAt) || a.id.localeCompare(b.id));
	return {
		schemaVersion: 1,
		kind: 'advice-request',
		items,
		source: sourceOf(pop, {
			from: pop.transactions.dateOf(first),
			to: pop.transactions.dateOf(lastIndex),
			...(options.customers !== undefined ? { customers: options.customers } : {})
		})
	};
}
