import { seededRandom } from '@craftabot/desk';
import type { BankCase } from '../model.js';
import { generateAccounts } from './accounts.js';
import { generateBureau } from './bureau.js';
import { generateComplaints } from './complaints.js';
import { generateCustomer } from './customer.js';
import { generateShelf } from './shelf.js';
import { generateTransactions } from './transactions.js';

export interface BankCaseOptions {
	transactionsPerAccount?: number;
	days?: number;
}

/**
 * **One customer with everything that hangs off them** (WP59, `48-FS-BANK.md`
 * §4.2): the entry a desk calls. One `seededRandom(seed)` threaded through
 * the generators in a fixed order — customer, accounts, transactions,
 * complaints, bureau — so the same seed is the same case, byte for byte,
 * in every desk and every host.
 */
export function bankCase(seed: number, options: BankCaseOptions = {}): BankCase {
	const random = seededRandom(seed);
	const customer = generateCustomer(random);
	const accounts = generateAccounts(random, customer);
	const transactions = generateTransactions(random, accounts, {
		...(options.transactionsPerAccount !== undefined
			? { perAccount: options.transactionsPerAccount }
			: {}),
		...(options.days !== undefined ? { days: options.days } : {})
	});
	const complaints = generateComplaints(random, customer);
	const bureau = generateBureau(random, customer, accounts);
	return { seed, customer, accounts, transactions, complaints, bureau, shelf: generateShelf() };
}
