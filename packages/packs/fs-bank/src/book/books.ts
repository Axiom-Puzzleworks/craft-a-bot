import { calibrationRow, type Book, type BookSource, type WorkItem } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import type { Account, AccountBaseline, BureauFile, CohortBlock, Transaction } from '../model.js';
import { rateOf, weightedRow } from '../generate/customer.js';
import type { Population, PopulationCustomer } from '../population/population.js';
import { accountDaySeed } from '../population/seeds.js';
import { alertRule, ALERT_RULE_ID, type AlertSignal } from './alert-rule.js';
import { performanceLabel, type PerformanceLabel } from './performance.js';

/**
 * **The books** (WP75, `67-PERFORMANCE-AND-BOOKS.md` §4–§6; `64-…` §6.1.3):
 * batches of work items drawn from a population without the clock — the
 * loan book and the alert book — each item carrying the truth a desk
 * would compute for it. A book is a pure function of a population, a
 * judge and a filter; its `source` names the population's digest and the
 * oversampling it was made with.
 */
export type Outcome = 'approve' | 'decline' | 'refer';

/** The plain record the Lending Desk's `Application` is, structurally. */
export interface LoanApplicationRecord {
	amount: number;
	termMonths: number;
	purpose: string;
	declaredMonthlyIncome: number;
	declaredMonthlyOutgoings: number;
}

/** What a judge returns — structurally the Lending Desk's `Verdict`. */
export interface RuleVerdict {
	verdict: Outcome;
	ratioPercent: number;
	repayment: number;
	reasons: string[];
}

export type Judge = (application: LoanApplicationRecord, bureau: BureauFile) => RuleVerdict;

export interface LoanApplication {
	id: string;
	customerId: string;
	/** ISO date on the population's calendar. */
	date: string;
	application: LoanApplicationRecord;
	/** Truth — never on the desk. */
	cohort: CohortBlock;
	verdict: RuleVerdict;
	performance: PerformanceLabel;
}

export interface BookFilter {
	from?: string;
	to?: string;
	cohort?: Record<string, string>;
	amount?: [number, number];
	outcome?: Outcome;
}

export interface LoanBook {
	rows: LoanApplication[];
	byOutcome: Record<Outcome, number>;
	source: BookSource;
	/** The same rows as work items, the verdict and the label in each item's truth. */
	book: Book;
}

const sourceOf = (pop: Population, extra: Partial<BookSource> = {}): BookSource => ({
	populationDigest: pop.digest,
	seed: pop.seed,
	size: pop.options.size,
	...extra
});

const isoDateTime = (date: string, hour: number, minute: number): string =>
	`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;

/** The book's own stream per customer: derived from the customer's seed, apart from the desk's and the day's. */
const bookSeed = (entry: PopulationCustomer, salt: number): number =>
	accountDaySeed(entry.seed, 0x600c, salt);

/**
 * The loan book: who applied in the period, what they asked for, what the
 * judge said, and whether the loan would have performed (§4).
 */
export function loanBook(pop: Population, judge: Judge, filter: BookFilter = {}): LoanBook {
	const table = pop.options.calibration;
	const incidence = rateOf(calibrationRow(table, 'application-incidence'), 'applies');
	const amounts = calibrationRow(table, 'loan-amount');
	const terms = calibrationRow(table, 'loan-term');
	const purposes = calibrationRow(table, 'loan-purpose');
	const noise = calibrationRow(table, 'declared-income-noise');
	const rows: LoanApplication[] = [];
	for (const entry of pop.customers) {
		const random = seededRandom(bookSeed(entry, 1));
		if (random() >= incidence) continue;
		const dayIndex = Math.floor(random() * pop.options.periodDays);
		const date = pop.transactions.dateOf(dayIndex);
		const income = entry.bureau.affordability.monthlyIncome;
		// "Customers round up": the declared income sits above the verified one by a stated noise.
		const roundUp = random() < rateOf(noise, 'roundsUp') ? 1 + rateOf(noise, 'by') : 1;
		const application: LoanApplicationRecord = {
			amount: Number(weightedRow(random, amounts)),
			termMonths: Number(weightedRow(random, terms)),
			purpose: weightedRow(random, purposes),
			declaredMonthlyIncome: Math.round(income * roundUp),
			declaredMonthlyOutgoings:
				entry.bureau.affordability.monthlyCommitments + Math.round(income * 0.3)
		};
		const verdict = judge(application, entry.bureau);
		const performance = performanceLabel(random, verdict, entry.bureau);
		rows.push({
			id: `loan-${entry.seed.toString(16).padStart(8, '0')}`,
			customerId: entry.customer.id,
			date,
			application,
			cohort: entry.customer.cohort,
			verdict,
			performance
		});
	}
	const kept = rows
		.filter(
			(row) =>
				(filter.from === undefined || row.date >= filter.from) &&
				(filter.to === undefined || row.date <= filter.to)
		)
		.filter((row) => filter.outcome === undefined || row.verdict.verdict === filter.outcome)
		.filter(
			(row) =>
				filter.amount === undefined ||
				(row.application.amount >= filter.amount[0] && row.application.amount <= filter.amount[1])
		)
		.filter((row) =>
			Object.entries(filter.cohort ?? {}).every(
				([attribute, value]) =>
					String((row.cohort as unknown as Record<string, unknown>)[attribute]) === value
			)
		)
		.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
	const byOutcome: Record<Outcome, number> = { approve: 0, decline: 0, refer: 0 };
	for (const row of kept) byOutcome[row.verdict.verdict] += 1;
	const source = sourceOf(pop, Object.keys(filter).length > 0 ? { filter } : {});
	return {
		rows: kept,
		byOutcome,
		source,
		book: {
			schemaVersion: 1,
			kind: 'application',
			source,
			items: kept.map((row) => applicationItem(row))
		}
	};
}

/** A loan application as a work item: the application is the payload; the verdict, the label and the cohort are truth. */
export function applicationItem(row: LoanApplication): WorkItem {
	return {
		id: row.id,
		kind: 'application',
		customerId: row.customerId,
		arrivedAt: isoDateTime(row.date, 9, 0),
		payload: row.application,
		truth: {
			records: [
				{
					id: 'verdict',
					kind: 'verdict',
					title: 'What the bank’s rules say',
					fields: {
						label: `should-${row.verdict.verdict}`,
						reasons: row.verdict.reasons.map((reason) => `why-${reason}`).join(','),
						ratio: `ratio-${row.verdict.ratioPercent}pc`
					}
				},
				{
					id: 'performance',
					kind: 'synthetic-hazard',
					title: 'Whether the loan would have performed (synthetic hazard, v1)',
					fields: {
						defaultedWithin12m: row.performance.defaultedWithin12m,
						hazard: row.performance.hazard,
						basis: row.performance.basis
					}
				}
			],
			facts: {
				verdict: `should-${row.verdict.verdict}`,
				shouldRefer: row.verdict.verdict === 'refer',
				ratioPercent: row.verdict.ratioPercent,
				defaultedWithin12m: row.performance.defaultedWithin12m,
				hazard: row.performance.hazard
			},
			cohort: {
				ageBand: row.cohort.ageBand,
				incomeBand: row.cohort.incomeBand,
				proxy: row.cohort.protectedProxies[0] ?? 'none',
				literacyBand: row.cohort.literacyBand,
				supportNeeds: row.cohort.supportNeeds ? 'yes' : 'no'
			}
		}
	};
}

export interface AlertItemPayload {
	transaction: Transaction;
	account: { id: string; kind: Account['kind']; masked: string };
	signals: AlertSignal[];
	typicalAmount: number;
	baseline: AccountBaseline;
	rule: typeof ALERT_RULE_ID;
}

/**
 * The factor the `fraud-incidence` row was raised by so a book has enough
 * positives (`66-…` §2, `67-…` §5): UK Finance's one case per 10,000 card
 * payments × 100. Carried on every alert book's `source.oversample`.
 */
export const FRAUD_OVERSAMPLE = 100;

export interface AlertBookOptions {
	from?: string;
	to?: string;
	/** Scan only the first `customers` customers — the browser's budget; the harness scans all. */
	customers?: number;
}

/**
 * The alert book: the rule run over the window's transactions for every
 * account, one item per alert, the planted label — or `legitimate` — in
 * its truth (§5). The rule's precision and recall over the window are
 * returned beside it, so the calibration test and the page read one fold.
 */
export function alertBook(
	pop: Population,
	options: AlertBookOptions = {}
): {
	book: Book;
	/** Planted transactions in the window, alerted or not. */
	planted: number;
	alerts: number;
	truePositives: number;
	precision: number;
	recall: number;
} {
	const last = pop.options.periodDays - 1;
	const first = Math.max(
		0,
		options.from !== undefined ? pop.transactions.indexOf(options.from) : last - 29
	);
	const lastIndex = Math.min(
		last,
		options.to !== undefined ? pop.transactions.indexOf(options.to) : last
	);
	const customers =
		options.customers === undefined ? pop.customers : pop.customers.slice(0, options.customers);
	const items: WorkItem[] = [];
	let planted = 0;
	let truePositives = 0;
	for (let dayIndex = first; dayIndex <= lastIndex; dayIndex += 1) {
		for (const entry of customers) {
			for (const account of entry.accounts) {
				// Read once and forget: a scan over the whole bank must not memoise every day of every account.
				const day = pop.transactions.forAccount(account.id, dayIndex, false);
				for (const transaction of day)
					if (pop.transactions.plantedLabel(transaction.id)) planted += 1;
				for (const raised of alertRule(account, day)) {
					const label = pop.transactions.plantedLabel(raised.transaction.id) ?? 'legitimate';
					if (label !== 'legitimate') truePositives += 1;
					const payload: AlertItemPayload = {
						transaction: raised.transaction,
						account: {
							id: account.id,
							kind: account.kind,
							masked: `••••${account.accountNumber.slice(-4)}`
						},
						signals: raised.signals,
						typicalAmount: account.baseline.typicalTransaction,
						baseline: account.baseline,
						rule: ALERT_RULE_ID
					};
					items.push({
						id: `alert-${raised.transaction.id.replace(/^txn-/, '')}`,
						kind: 'alert',
						customerId: entry.customer.id,
						arrivedAt: `${raised.transaction.date ?? pop.transactions.dateOf(dayIndex)}T${raised.transaction.time}:00.000Z`,
						payload,
						truth: {
							records: [
								{
									id: `alert-truth-${raised.transaction.id}`,
									kind: 'alert-label',
									title: 'What the alert really was',
									fields: { label, signals: raised.signals.join(',') }
								}
							],
							facts: { label, planted: label !== 'legitimate' },
							cohort: {
								ageBand: entry.customer.cohort.ageBand,
								incomeBand: entry.customer.cohort.incomeBand,
								proxy: entry.customer.cohort.protectedProxies[0] ?? 'none'
							}
						}
					});
				}
			}
		}
	}
	const oversample = FRAUD_OVERSAMPLE;
	const filter = {
		from: pop.transactions.dateOf(first),
		to: pop.transactions.dateOf(lastIndex),
		...(options.customers !== undefined ? { customers: options.customers } : {})
	};
	return {
		book: {
			schemaVersion: 1,
			kind: 'alert',
			items,
			source: sourceOf(pop, { filter, oversample })
		},
		planted,
		alerts: items.length,
		truePositives,
		precision: items.length === 0 ? 0 : truePositives / items.length,
		recall: planted === 0 ? 0 : truePositives / planted
	};
}
