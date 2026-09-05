import type { PackManifest } from '@craftabot/core';

/**
 * **`@craftabot/pack-fs-bank`** — the synthetic bank (WP59, `48-FS-BANK.md`;
 * `41-…` §6.5.1). Content only: generators, a product shelf, service lines
 * (stage B), a persona library, the obligation vocabulary and the control-map
 * rows. No runtime, no world, no brick kind — those are the desks' (WP60,
 * WP62, WP63), which depend on this pack. Every identifier is a synthetic
 * primitive's (hard rule 9); every case is deterministic from its seed.
 */
export const FS_BANK_PACK_ID = 'fs-bank';

const manifest: PackManifest = {
	id: FS_BANK_PACK_ID,
	name: 'The Bank (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	/** The Connector brick is the starter's; a line is fitted through it. */
	requiresPacks: { starter: '>=0.3.0' }
};

export default manifest;

export * from './model.js';
export { bankCase, type BankCaseOptions } from './generate/case.js';
export { generateCustomer } from './generate/customer.js';
export { generateAccounts, monthlyIncomeOf } from './generate/accounts.js';
export { generateTransactions } from './generate/transactions.js';
export { generateComplaints } from './generate/complaints.js';
export { generateBureau } from './generate/bureau.js';
export { SHELF, generateShelf } from './generate/shelf.js';
export { bankRecords, driverList, hasAnyDriver, type BankRecords } from './records.js';
export {
	BANK_PURPOSES,
	bankExtra,
	bankExtraOf,
	emptyLedger,
	type BankExtra,
	type BankLedger,
	type BankPurpose
} from './extra.js';
