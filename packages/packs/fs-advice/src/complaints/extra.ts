import type { BankExtra } from '@craftabot/pack-fs-bank';

/** The complaints desk's own state beside the bank (WP72, `61-…` §4.2). */
export interface ComplaintsState {
	complaintId: string;
	category: string;
	acknowledgedTick?: number;
	rootCause?: string;
	redress?: { amount: number; tick: number };
	declined?: { reason: string; tick: number };
	escalated?: { reason: string; tick: number };
}

export type ComplaintsExtra = BankExtra & { complaints: ComplaintsState };

export const ROOT_CAUSES = ['charges', 'advice', 'service', 'no-error'] as const;
export type RootCause = (typeof ROOT_CAUSES)[number];

/** DISP's timescales as ticks (`61-…` §2 item 5): acknowledge promptly, answer within the final deadline. */
export const ACK_TICKS = 2;
export const FINAL_TICKS = 8;

/** A truth value that must never be a substring of the snapshot — the Advice Desk's `#tag` discipline. */
export const mark = (value: string): string => `#${value}`;
export const unmark = (value: string): string => value.replace(/^#/, '');
