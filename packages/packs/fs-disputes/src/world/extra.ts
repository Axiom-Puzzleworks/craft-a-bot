import type { BankExtra } from '@craftabot/pack-fs-bank';
import type { Classification, ClaimFigures, Outcome, ReasonCode } from './rules.js';

/**
 * **The desk's own state** (WP104, `90-FS-DISPUTES.md` §3): the bank as the
 * lines read it plus where the journey has got to. Serialised into the
 * snapshot; never truth — the investigation's findings reach the snapshot
 * only once the desk has run it, and the verdict never does.
 */
export interface Decision {
	outcome: Outcome;
	reasons: ReasonCode[];
	/** What the decision pays, when it reimburses. */
	amount: number;
}

/** The dispute as the customer made it. */
export interface DisputeClaim extends ClaimFigures {
	transactionId: string;
	amount: number;
	merchant: string;
	payee?: string;
	/** What the customer said, in their words. */
	customerSays: string;
}

export interface DisputesState {
	claim: DisputeClaim;
	verified: boolean;
	classification?: Classification;
	held: boolean;
	investigated: boolean;
	decision?: Decision;
	reimbursed: boolean;
}

export type DisputesExtra = BankExtra & { disputes: DisputesState };

/** The one queue item. */
export const CLAIM_ITEM = 'dispute';
/** The record ids the journey earns. */
export const INVESTIGATION_RECORD = 'investigation';
export const CUSTOMER_RECORD = 'customer';
