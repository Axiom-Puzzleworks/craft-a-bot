import { calibrationRow, canonicalJson, type CalibrationTable } from '@craftabot/core';
import { seededRandom } from '@craftabot/desk';
import type { Account, BankCase, BureauFile, Complaint, Customer, Transaction } from '../model.js';
import { CALIBRATION } from '../calibration/table.js';
import { generateAccounts } from '../generate/accounts.js';
import { generateBureau } from '../generate/bureau.js';
import { generateComplaints } from '../generate/complaints.js';
import { generateCustomer } from '../generate/customer.js';
import { generateShelf } from '../generate/shelf.js';
import { dayTransactions, type PlantedLabel } from '../generate/transactions.js';
import { sha256Hex } from './sha256.js';
import { accountDaySeed, customerSeed } from './seeds.js';

/**
 * **The population** (WP74 stage B, `66-CALIBRATION.md` §4.3; `64-…`
 * §6.1.1, decision D5): the whole synthetic bank at one seed — thousands
 * of customers with their accounts, bureau files and complaints, and a
 * lazy stream of transactions over a calendar — drawn from the cited
 * calibration table, never stored whole, regenerated from its seed in
 * seconds, and identified by a digest over a canonical sample. Customer
 * *k* is customer *k* at any size (`seeds.ts`), so a small population is
 * the head of a large one and a shard is an ordinal range.
 *
 * `bankCase(seed)` is untouched: it draws from the deck weights for the
 * desks' designed cases; `customerCase(pop, id)` hands a population's
 * customer to a desk in the same shape.
 */
export interface PopulationOptions {
	/** Customers. The browser's default is 2,000; the harness passes 20,000. */
	size: number;
	/** The calendar the transactions cover. Default 180. */
	periodDays: number;
	/** ISO date, day 0 of the calendar — synthetic. Default 2026-01-05. */
	startDate: string;
	/** The table the generators draw from. Default: the shipped cited table. */
	calibration: CalibrationTable;
}

export const POPULATION_DEFAULTS: Readonly<Omit<PopulationOptions, 'calibration'>> = {
	size: 2_000,
	periodDays: 180,
	startDate: '2026-01-05'
};

/** One customer of the population, eager: everything but the transactions. */
export interface PopulationCustomer {
	ordinal: number;
	seed: number;
	customer: Customer;
	accounts: Account[];
	complaints: Complaint[];
	bureau: BureauFile;
}

/**
 * The transactions, never materialised whole: an account's day is
 * generated when asked and memoised. `day` on a transaction is days before
 * the period's end (its meaning in `bankCase`); `date` is the calendar day.
 */
export interface TransactionStream {
	/**
	 * The transactions of one account on calendar day `dayIndex` (0 … periodDays − 1).
	 * Memoised unless `remember` is false — a scan over the whole bank (the alert book) reads once and forgets.
	 */
	forAccount(accountId: string, dayIndex: number, remember?: boolean): Transaction[];
	/** The planted truth on a transaction the stream has generated, or undefined (`67-…` §5). Never on the transaction. */
	plantedLabel(transactionId: string): PlantedLabel | undefined;
	/** Every transaction with a calendar date in [from, to], by date then account, ISO dates inclusive. */
	between(from: string, to: string): Iterable<Transaction>;
	/** Calendar index → ISO date, and back. */
	dateOf(dayIndex: number): string;
	indexOf(date: string): number;
}

export interface Population {
	seed: number;
	options: PopulationOptions;
	customers: PopulationCustomer[];
	transactions: TransactionStream;
	/** SHA-256 over a canonical sample — the population's identity (`66-…` §4.3). */
	digest: string;
	byId(customerId: string): PopulationCustomer | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function population(seed: number, overrides: Partial<PopulationOptions> = {}): Population {
	const options: PopulationOptions = {
		...POPULATION_DEFAULTS,
		calibration: CALIBRATION,
		...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined))
	} as PopulationOptions;
	if (!Number.isInteger(options.size) || options.size < 1)
		throw new Error(`population: size must be a positive integer, got ${options.size}`);
	const calibrated = { calibration: options.calibration };
	const customers: PopulationCustomer[] = [];
	const byId = new Map<string, PopulationCustomer>();
	for (let ordinal = 0; ordinal < options.size; ordinal += 1) {
		const mySeed = customerSeed(seed, ordinal);
		const random = seededRandom(mySeed);
		// The existing order per customer (`48-…` §4.2), the transactions left to the stream.
		const customer = generateCustomer(random, calibrated);
		const accounts = generateAccounts(random, customer, calibrated);
		const complaints = generateComplaints(random, customer, calibrated);
		const bureau = generateBureau(random, customer, accounts, calibrated);
		const entry: PopulationCustomer = {
			ordinal,
			seed: mySeed,
			customer,
			accounts,
			complaints,
			bureau
		};
		customers.push(entry);
		byId.set(customer.id, entry);
	}

	const startMs = Date.parse(`${options.startDate}T00:00:00.000Z`);
	const accountOwner = new Map<string, { entry: PopulationCustomer; index: number }>();
	for (const entry of customers) {
		entry.accounts.forEach((account, index) => accountOwner.set(account.id, { entry, index }));
	}
	const memo = new Map<string, Transaction[]>();
	// The planted labels the stream has drawn so far — beside the rows, never on them.
	const planted = new Map<string, PlantedLabel>();
	const stream: TransactionStream = {
		dateOf: (dayIndex) => isoDay(startMs + dayIndex * DAY_MS),
		indexOf: (date) => Math.round((Date.parse(`${date}T00:00:00.000Z`) - startMs) / DAY_MS),
		forAccount(accountId, dayIndex, remember = true) {
			if (dayIndex < 0 || dayIndex >= options.periodDays) return [];
			const key = `${accountId}:${dayIndex}`;
			const cached = memo.get(key);
			if (cached) return cached;
			const owner = accountOwner.get(accountId);
			if (!owner) return [];
			const account = owner.entry.accounts[owner.index]!;
			const random = seededRandom(accountDaySeed(owner.entry.seed, owner.index, dayIndex));
			const made = dayTransactions(random, account, {
				...calibrated,
				day: options.periodDays - 1 - dayIndex,
				date: stream.dateOf(dayIndex)
			});
			for (const [id, label] of Object.entries(made.planted)) planted.set(id, label);
			if (remember) memo.set(key, made.transactions);
			return made.transactions;
		},
		plantedLabel: (transactionId) => planted.get(transactionId),
		*between(from, to) {
			const first = Math.max(0, stream.indexOf(from));
			const last = Math.min(options.periodDays - 1, stream.indexOf(to));
			for (let dayIndex = first; dayIndex <= last; dayIndex += 1) {
				for (const entry of customers) {
					for (const account of entry.accounts) {
						yield* stream.forAccount(account.id, dayIndex);
					}
				}
			}
		}
	};

	return {
		seed,
		options,
		customers,
		transactions: stream,
		digest: populationDigest(seed, options, customers),
		byId: (id) => byId.get(id)
	};
}

/** Fibonacci ordinals up to `size`: a sample that grows with the population but stays small. */
export function sampleOrdinals(size: number): number[] {
	const out: number[] = [];
	let a = 0;
	let b = 1;
	while (a < size) {
		if (!out.includes(a)) out.push(a);
		[a, b] = [b, a + b];
	}
	return out;
}

/**
 * SHA-256 over the options, the table's rows (id → distribution) and the
 * customers at the Fibonacci ordinals, as canonical JSON. A change to the
 * seed, the size, the calendar, any row or any generator moves it.
 */
export function populationDigest(
	seed: number,
	options: PopulationOptions,
	customers: readonly PopulationCustomer[]
): string {
	const rows = Object.fromEntries(
		options.calibration.rows.map((row) => [row.id, row.distribution])
	);
	const sample = sampleOrdinals(options.size)
		.map((ordinal) => customers[ordinal])
		.filter((entry): entry is PopulationCustomer => entry !== undefined)
		.map(({ ordinal, customer, accounts, complaints, bureau }) => ({
			ordinal,
			customer,
			accounts,
			complaints,
			bureau
		}));
	return sha256Hex(
		canonicalJson({
			seed,
			size: options.size,
			periodDays: options.periodDays,
			startDate: options.startDate,
			table: options.calibration.id,
			rows,
			sample
		})
	);
}

/**
 * A population's customer in a desk's shape (`64-…` §6.1.1): `bankCase`'s
 * record with the last thirty calendar days of transactions materialised,
 * `day` counted back from the period's end as a desk expects.
 */
export function customerCase(pop: Population, customerId: string, days = 30): BankCase {
	const entry = pop.byId(customerId);
	if (!entry) throw new Error(`population: no customer "${customerId}"`);
	const transactions: Transaction[] = [];
	const last = pop.options.periodDays - 1;
	for (let dayIndex = Math.max(0, last - days + 1); dayIndex <= last; dayIndex += 1) {
		for (const account of entry.accounts) {
			transactions.push(...pop.transactions.forAccount(account.id, dayIndex));
		}
	}
	transactions.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
	return {
		seed: entry.seed,
		customer: entry.customer,
		accounts: entry.accounts,
		transactions,
		complaints: entry.complaints,
		bureau: entry.bureau,
		shelf: generateShelf()
	};
}

/** The marginal a calibration row claims, read off the population — what the bank page draws beside the row's target. */
export function marginalOf(
	pop: Population,
	rowId: string,
	draw: (entry: PopulationCustomer) => string | undefined
): Record<string, number> {
	const row = calibrationRow(pop.options.calibration, rowId);
	const counts = new Map<string, number>();
	let total = 0;
	for (const entry of pop.customers) {
		const value = draw(entry);
		if (value === undefined) continue;
		total += 1;
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return Object.fromEntries(
		Object.keys(row.distribution).map((category) => [
			category,
			total === 0 ? 0 : (counts.get(category) ?? 0) / total
		])
	);
}
