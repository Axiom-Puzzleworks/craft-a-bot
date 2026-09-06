import type { BankExtra } from '@craftabot/pack-fs-bank';
import type { Application, Outcome, ReasonCode } from './rules.js';

/**
 * **The desk's own state** (WP63, `52-FS-LENDING.md` §4.2): the bank as the
 * lines read it plus where the journey has got to. Serialised into the
 * snapshot; never truth — the verdict is not here, only the arithmetic the
 * worksheet shows.
 */
export interface Decision {
	outcome: Outcome;
	reasons: ReasonCode[];
}

export interface LendingState {
	application: Application;
	verified: boolean;
	assessed: boolean;
	decision?: Decision;
	/** The reason codes explained so far, in order. */
	explained: ReasonCode[];
	disbursed: boolean;
	appeal?: string;
	/** Documents requested and on file, by kind. */
	documents: string[];
}

export type LendingExtra = BankExtra & { lending: LendingState };

/** The one queue item. */
export const APPLICATION_ITEM = 'application';
/** The record ids the journey earns. */
export const WORKSHEET_RECORD = 'affordability-worksheet';
export const PAYSLIP_RECORD = 'payslip';
export const STATEMENT_RECORD = 'bank-statement';
