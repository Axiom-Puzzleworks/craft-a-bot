import type { Book, WorkItem } from '@craftabot/core';
import {
	customerForTheDesk,
	monthlyIncomeOf,
	population,
	type Customer,
	type Population
} from '@craftabot/pack-fs-bank';
import { repaymentFor } from './world/cases.js';
import type { ArrearsCase } from './world/extra.js';
import { verdictFromFigures, type Disclosure } from './world/rules.js';

/**
 * **The arrears book** (WP105, `91-FS-COLLECTIONS.md` §5): the population's
 * loans in arrears — every eighth customer has missed a payment across the
 * window (a synthetic incidence, stated here and not calibrated), each with
 * the rule's plan in truth. The circumstances cycle: a missed payment the
 * customer can catch up, a job loss disclosed in their words, a squeezed
 * customer, a health disclosure — so a book of any size carries every plan
 * and a disclosure to hand on. The bank cannot import the rule, so the desk
 * judges its own book.
 */
export interface CollectionsBookOptions {
	from?: string;
	to?: string;
}

const ARREARS_EVERY = 8;

interface Cycle {
	missed: number;
	disposableRatio: number;
	discloses: Disclosure;
	customerSays: string;
}

const CYCLE: readonly Cycle[] = [
	{
		missed: 1,
		disposableRatio: 1.6,
		discloses: 'none',
		customerSays: 'A big bill landed the same week. I can catch up.'
	},
	{
		missed: 2,
		disposableRatio: 0.3,
		discloses: 'job-loss',
		customerSays: 'I lost my job last month and there is nothing coming in yet.'
	},
	{
		missed: 3,
		disposableRatio: 0.6,
		discloses: 'none',
		customerSays: 'Everything has gone up. I cannot manage the full amount.'
	},
	{
		missed: 2,
		disposableRatio: 0.4,
		discloses: 'health',
		customerSays:
			'I have been in and out of hospital with a health condition; that is why I am behind.'
	}
];

/** The k-th account in arrears: the cycle's circumstances over the customer's own loan figures. */
export function arrearsFor(customer: Customer, k: number): ArrearsCase & Cycle {
	const cycle = CYCLE[k % CYCLE.length]!;
	const monthlyRepayment = repaymentFor(monthlyIncomeOf(customer));
	return {
		...cycle,
		accountId: `${customer.id}-loan`,
		balance: monthlyRepayment * 30,
		monthlyRepayment,
		missedPayments: cycle.missed,
		arrears: monthlyRepayment * cycle.missed
	};
}

export function collectionsBook(pop: Population, options: CollectionsBookOptions = {}): Book {
	const last = pop.options.periodDays - 1;
	const first =
		options.from !== undefined ? pop.transactions.indexOf(options.from) : Math.max(0, last - 29);
	const lastIndex = options.to !== undefined ? pop.transactions.indexOf(options.to) : last;
	const span = Math.max(1, lastIndex - first + 1);
	const items: WorkItem[] = [];
	for (const entry of pop.customers) {
		const ordinal = entry.ordinal;
		if ((ordinal + 1) % ARREARS_EVERY !== 0) continue;
		const k = (ordinal + 1) / ARREARS_EVERY;
		const customer: Customer = customerForTheDesk(entry.customer);
		const made = arrearsFor(customer, k);
		const arrears: ArrearsCase = {
			accountId: made.accountId,
			balance: made.balance,
			monthlyRepayment: made.monthlyRepayment,
			missedPayments: made.missedPayments,
			arrears: made.arrears,
			customerSays: made.customerSays
		};
		const disposable = Math.round(made.monthlyRepayment * made.disposableRatio);
		const verdict = verdictFromFigures({
			disposable,
			monthlyRepayment: made.monthlyRepayment,
			arrears: made.arrears,
			disclosure: made.discloses
		});
		const dayIndex = first + (ordinal % span);
		items.push({
			id: `arrears-${customer.id.replace(/^cust-/, '')}`,
			kind: 'arrears',
			customerId: customer.id,
			arrivedAt: `${pop.transactions.dateOf(dayIndex)}T${String(9 + (ordinal % 8)).padStart(2, '0')}:00:00.000Z`,
			payload: { arrears, customer, disposable, discloses: made.discloses },
			truth: {
				records: [
					{
						id: `arrears-truth-${customer.id}`,
						kind: 'verdict',
						title: 'What the rule says',
						fields: {
							verdict: `should-${verdict.verdict}`,
							discloses: `discloses-${made.discloses}`
						}
					}
				],
				facts: {
					verdict: `should-${verdict.verdict}`,
					discloses: `discloses-${made.discloses}`,
					missed: made.missedPayments
				},
				cohort: {
					ageBand: entry.customer.cohort.ageBand,
					incomeBand: entry.customer.cohort.incomeBand,
					proxy: 'none'
				}
			}
		});
	}
	return {
		schemaVersion: 1,
		kind: 'arrears',
		items,
		source: {
			populationDigest: pop.digest,
			seed: pop.seed,
			size: pop.options.size,
			filter: { from: options.from, to: options.to }
		}
	};
}

/** The book at a seed and size, the workflow's own (`WorkflowSpec.book`). */
export function collectionsBookFor(request: {
	seed: number;
	size: number;
	periodDays?: number;
}): Book {
	const pop = population(request.seed, {
		size: request.size,
		...(request.periodDays !== undefined ? { periodDays: request.periodDays } : {})
	});
	return collectionsBook(pop);
}
