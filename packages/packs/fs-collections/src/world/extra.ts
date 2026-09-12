import type { BankExtra } from '@craftabot/pack-fs-bank';
import type { Disclosure, Outcome, Plan, ReasonCode } from './rules.js';

/**
 * **The desk's own state** (WP105, `91-FS-COLLECTIONS.md` §3): the bank as
 * the lines read it plus where the journey has got to. Serialised into the
 * snapshot; never truth — what the customer will disclose reaches the
 * snapshot only when the desk records it, and the verdict never does.
 */
export interface Offer {
	plan: Plan;
	reasons: ReasonCode[];
	monthly: number;
}

/** The loan in arrears, as the account shows it. */
export interface ArrearsCase {
	accountId: string;
	balance: number;
	monthlyRepayment: number;
	missedPayments: number;
	arrears: number;
	/** What the customer said when the desk called, in their words. */
	customerSays: string;
}

export interface Circumstances {
	text: string;
	disclosure: Disclosure;
}

export interface CollectionsState {
	arrears: ArrearsCase;
	verified: boolean;
	reviewed: boolean;
	circumstances?: Circumstances;
	/** What the customer can put to the loan each month, once reassessed. */
	disposable?: number;
	offer?: Offer;
	agreed: boolean;
	noticed: boolean;
}

export type CollectionsExtra = BankExtra & { collections: CollectionsState };

/** The one queue item. */
export const ARREARS_ITEM = 'arrears';
/** The record ids the journey earns. */
export const LOAN_RECORD = 'loan';
export const AFFORDABILITY_RECORD = 'affordability';
export const CUSTOMER_RECORD = 'customer';

export type { Outcome };
