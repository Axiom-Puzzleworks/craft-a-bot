import type { BankCase } from './model.js';

/**
 * **The bank in a desk's state** (WP59, `48-FS-BANK.md` §4.4): what a desk
 * puts in `DeskState.extra` so the bank's lines can answer from the
 * snapshot they are handed. A line reads the world, it does not act in it
 * (`47-…` §3): the mutations a line *would* make — holds, freezes, filed
 * reports, orders, redress — come back as `data` for the desk's own action
 * to write into `ledger`, so a snapshot shows them and a replay agrees.
 */
export type BankPurpose =
	'advice' | 'fraud-operations' | 'lending' | 'complaints' | 'reception' | 'testing';

export const BANK_PURPOSES: readonly BankPurpose[] = [
	'advice',
	'fraud-operations',
	'lending',
	'complaints',
	'reception',
	'testing'
];

export interface BankLedger {
	holds: Array<{ accountId: string; amount: number; reason: string }>;
	freezes: Array<{ accountId: string; reason: string }>;
	heldPayments: string[];
	releasedPayments: string[];
	sentPayments: Array<{ fromAccountId: string; payee: string; amount: number }>;
	sars: Array<{ accountId: string; reason: string }>;
	orders: Array<{ productId: string; amount: number }>;
	complaints: Array<{ id: string; category: string; summary: string; status: string }>;
	redress: Array<{ complaintId: string; amount: number }>;
	notes: string[];
	verified: boolean;
	contact: Record<string, string>;
}

export const emptyLedger = (): BankLedger => ({
	holds: [],
	freezes: [],
	heldPayments: [],
	releasedPayments: [],
	sentPayments: [],
	sars: [],
	orders: [],
	complaints: [],
	redress: [],
	notes: [],
	verified: false,
	contact: {}
});

export interface BankExtra {
	purpose: BankPurpose;
	bank: BankCase;
	ledger: BankLedger;
	/** A deck may name a product whose factsheet carries the poisoned payload (`41-…` §6.5.2's red team). */
	poisonedFactsheet?: { productId: string; payload: string };
}

/** `extra` for a fresh desk over a case. */
export function bankExtra(purpose: BankPurpose, bank: BankCase): BankExtra {
	return { purpose, bank, ledger: emptyLedger() };
}

/** The bank a line can see in a world snapshot, or `undefined` when this desk carries none. */
export function bankExtraOf(worldState: unknown): BankExtra | undefined {
	const extra = (worldState as { extra?: unknown } | undefined)?.extra as
		Partial<BankExtra> | undefined;
	if (!extra || typeof extra !== 'object') return undefined;
	if (typeof extra.purpose !== 'string' || !extra.bank || typeof extra.bank !== 'object')
		return undefined;
	return extra as BankExtra;
}
