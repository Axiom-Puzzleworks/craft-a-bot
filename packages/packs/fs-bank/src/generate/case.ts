import type { CalibrationTable } from '@craftabot/core';
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
	/**
	 * The table the generators draw from (WP74, `66-CALIBRATION.md` §4.2):
	 * `DECK_WEIGHTS` unless told otherwise, so a desk's case is what it always
	 * was; a population passes `CALIBRATION`.
	 */
	calibration?: CalibrationTable;
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
	const calibrated = options.calibration ? { calibration: options.calibration } : {};
	const customer = generateCustomer(random, calibrated);
	const accounts = generateAccounts(random, customer, calibrated);
	const transactions = generateTransactions(random, accounts, {
		...(options.transactionsPerAccount !== undefined
			? { perAccount: options.transactionsPerAccount }
			: {}),
		...(options.days !== undefined ? { days: options.days } : {}),
		...calibrated
	});
	const complaints = generateComplaints(random, customer, calibrated);
	const bureau = generateBureau(random, customer, accounts, calibrated);
	return { seed, customer, accounts, transactions, complaints, bureau, shelf: generateShelf() };
}
