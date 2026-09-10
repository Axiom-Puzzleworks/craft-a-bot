import type { Account, AccountBaseline, Transaction } from '../model.js';

/**
 * **The alert rule** (WP75, `67-PERFORMANCE-AND-BOOKS.md` §5; `64-…`
 * §6.1.3): a stated, pure detector over one account's day of transactions
 * — the shapes the generator already makes — raising an alert per
 * transaction that trips a signal. It is what the fraud workflow's
 * `rules-only` configuration *is*, and its own precision and recall over
 * the population are a calibration test. No model is fitted (`64-…` §11).
 */
export type AlertSignal =
	'velocity' | 'new-device' | 'abroad' | 'night-cnp' | 'new-payee' | 'large';

export interface RaisedAlert {
	transaction: Transaction;
	signals: AlertSignal[];
}

export const ALERT_RULE_ID = 'fs-bank/alert-rule-v1';

/** The signals a transaction trips on its account, given the account's baseline; empty when none. */
export function signalsOf(transaction: Transaction, account: Account): AlertSignal[] {
	const baseline: AccountBaseline = account.baseline;
	const signals: AlertSignal[] = [];
	if (transaction.velocity >= 3) signals.push('velocity');
	if (transaction.device === 'app on a new phone') signals.push('new-device');
	if (!baseline.countries.includes(transaction.country)) signals.push('abroad');
	const hour = Number(transaction.time.slice(0, 2));
	if (
		transaction.channel === 'card-not-present' &&
		hour < 6 &&
		transaction.amount > 3 * baseline.typicalTransaction
	)
		signals.push('night-cnp');
	if (transaction.channel === 'faster-payment' && transaction.payee === 'a new payee')
		signals.push('new-payee');
	if (transaction.direction === 'debit' && transaction.amount > 10 * baseline.typicalTransaction)
		signals.push('large');
	return signals;
}

/** Every alert the rule raises over an account's day. */
export function alertRule(account: Account, day: readonly Transaction[]): RaisedAlert[] {
	const out: RaisedAlert[] = [];
	for (const transaction of day) {
		const signals = signalsOf(transaction, account);
		if (signals.length > 0) out.push({ transaction, signals });
	}
	return out;
}
