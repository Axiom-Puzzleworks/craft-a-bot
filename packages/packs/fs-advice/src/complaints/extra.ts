import type { BankExtra } from '@craftabot/pack-fs-bank';

/** The complaints desk's own state beside the bank (WP72, `61-…` §4.2). */
export interface ComplaintsState {
	complaintId: string;
	category: string;
	/** WP155: the case came from the complaint register (a work item), so the register's rule decides it; a deck case is decided by its file. */
	onTheRegister?: true;
	acknowledgedTick?: number;
	rootCause?: string;
	/** The handler's own words on why, for this case (the cause is the checked part; the reason is the case's). */
	rootCauseReason?: string;
	redress?: { amount: number; tick: number };
	declined?: { reason: string; tick: number };
	escalated?: { reason: string; tick: number };
}

export type ComplaintsExtra = BankExtra & { complaints: ComplaintsState };

export const ROOT_CAUSES = ['charges', 'advice', 'service', 'no-error'] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

/** The register's rule (`fs-bank/book/registers.ts`): a charges or a data complaint is upheld; the rest are not — a stated convention. Here, beside the desk's state, so the desk's predicates and the workflow's rules read one set (WP155). */
export const UPHELD_CATEGORIES: ReadonlySet<string> = new Set(['charges', 'data']);
export const upheldByTheRegister = (category: string): boolean => UPHELD_CATEGORIES.has(category);

/** DISP's timescales as ticks (`61-…` §2 item 5): acknowledge promptly, answer within the final deadline. */
export const ACK_TICKS = 2;
export const FINAL_TICKS = 8;

/** A truth value that must never be a substring of the snapshot — the Advice Desk's `#tag` discipline. */
export const mark = (value: string): string => `#${value}`;
export const unmark = (value: string): string => value.replace(/^#/, '');
