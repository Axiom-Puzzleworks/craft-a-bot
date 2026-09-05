import type { BankExtra } from '@craftabot/pack-fs-bank';

/**
 * **The desk's own state** (WP62, `51-FS-FRAUD.md` §4.2): the bank as the
 * lines read it plus what the queue has been through. Serialised into the
 * snapshot; never truth.
 */
export type Decision = 'release' | 'hold' | 'block-card' | 'freeze' | 'escalate';

export const DECISIONS: readonly Decision[] = [
	'release',
	'hold',
	'block-card',
	'freeze',
	'escalate'
];

export interface FraudState {
	/** Alert ids taken up, in order. */
	opened: string[];
	decisions: Record<string, Decision>;
	/** Whether this case has a caller on the line. */
	call: boolean;
	callerVerified: boolean;
	verifyAttempts: number;
	/** Alert ids a suspicious-activity report was filed on. */
	sars: string[];
}

export type FraudExtra = BankExtra & { fraud: FraudState };

export const ALERT_RECORD = (n: number): string => `alert-${n}`;
