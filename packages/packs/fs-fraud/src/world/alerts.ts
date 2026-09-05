import type { DeskRecord } from '@craftabot/core';
import type { Account, BankCase } from '@craftabot/pack-fs-bank';

/**
 * **Alerts** (WP62, `51-FS-FRAUD.md` §4.2, principle 2): a case's queue is
 * built by hand — every alert with its amount, merchant, geography, device,
 * velocity and time, its *true* label, and the *reason* an analyst could
 * find, placed where a look-up earns it. Never a random departure the bank
 * happened to generate; the bank supplies the customer and the accounts.
 */
/**
 * The truth's vocabulary: `fraudulent`, `legitimate`, `mule-in` — not `fraud`
 * and `genuine`, since a truth leaf may not be a substring of the snapshot
 * (`checkDesk`), and the desk's purpose is `fraud-operations`.
 */
export type AlertLabel = 'fraudulent' | 'legitimate' | 'mule-in';

export interface FraudAlert {
	n: number;
	accountId: string;
	amount: number;
	direction: 'debit' | 'credit';
	merchant: string;
	category: string;
	channel: 'card-present' | 'online' | 'app' | 'transfer';
	device?: string;
	country: string;
	time: string;
	/** Payments in the same hour on the account. */
	velocity: number;
	payee?: string;
	/** What the desk cannot see. */
	label: AlertLabel;
	reason: string;
	/** A line the finding leaves on the account's recent activity, for `look-up` to earn. */
	finding?: string;
}

const mask = (account: Account): string => `••••${account.accountNumber.slice(-4)}`;

/** The shapes an alert can take: content, parameterised by the case's accounts. */
export function alertKinds(bank: BankCase) {
	const current = bank.accounts.find((a) => a.kind === 'current') ?? (bank.accounts[0] as Account);
	const card = bank.accounts.find((a) => a.kind === 'credit-card') ?? current;
	const usualDevice = current.baseline.devices[0] ?? 'the usual phone';
	const usualMerchant =
		current.baseline.payees[0] ?? current.baseline.merchantCategories[0] ?? 'a usual shop';
	const home = current.baseline.countries[0] ?? 'United Kingdom';
	const base = (n: number) => ({
		n,
		accountId: current.id,
		direction: 'debit' as const,
		country: home
	});
	return {
		newPayeeAtNight: (n: number): FraudAlert => ({
			...base(n),
			amount: 1850,
			merchant: 'Faster payment',
			category: 'transfer',
			channel: 'transfer',
			device: 'unknown Android',
			time: '03:12',
			velocity: 1,
			payee: 'NEW PAYEE — J. Osei',
			label: 'fraudulent',
			reason:
				'a new payee minutes after a password reset from an unknown device — account takeover',
			finding: 'day -0 02:58 password reset (unknown Android, first seen)'
		}),
		travelCard: (n: number): FraudAlert => ({
			...base(n),
			accountId: card.id,
			amount: 62,
			merchant: 'Café Central',
			category: 'restaurants',
			channel: 'card-present',
			country: 'Spain',
			time: '13:40',
			velocity: 1,
			label: 'legitimate',
			reason: 'the customer told the bank they were travelling; a travel note is on the CRM',
			finding: 'day -3 CRM: customer travelling to Spain 4–11 days'
		}),
		muleIn: (n: number): FraudAlert => ({
			...base(n),
			direction: 'credit',
			amount: 2400,
			merchant: 'Incoming faster payment',
			category: 'transfer',
			channel: 'transfer',
			time: '10:05',
			velocity: 2,
			payee: 'FROM — an account opened last month',
			label: 'mule-in',
			reason:
				'a credit from a new account followed within the hour by an outgoing payment of most of it',
			finding: 'day -0 10:41 outgoing £2,250 to a payee added today'
		}),
		usualShop: (n: number): FraudAlert => ({
			...base(n),
			amount: Math.round(current.baseline.typicalTransaction * 2.4),
			merchant: usualMerchant,
			category: current.baseline.merchantCategories[0] ?? 'groceries',
			channel: 'card-present',
			device: usualDevice,
			time: '17:20',
			velocity: 1,
			label: 'legitimate',
			reason: 'a usual merchant on the usual device, a larger basket than usual',
			finding: `day -7 ${usualMerchant} (usual)`
		}),
		rapidOnline: (n: number): FraudAlert => ({
			...base(n),
			accountId: card.id,
			amount: 340,
			merchant: 'GameTop Store',
			category: 'electronics',
			channel: 'online',
			device: 'unknown desktop',
			time: '22:48',
			velocity: 3,
			label: 'fraudulent',
			reason: 'three online purchases in ten minutes on a device never seen before',
			finding: 'day -0 22:41 GameTop Store £120 (unknown desktop); 22:44 £190'
		}),
		coachedPayment: (n: number): FraudAlert => ({
			...base(n),
			amount: 8000,
			merchant: 'Faster payment',
			category: 'transfer',
			channel: 'app',
			device: usualDevice,
			time: '11:30',
			velocity: 1,
			payee: 'CREST CAPITAL HOLDINGS (payee added 4 days ago)',
			label: 'fraudulent',
			reason:
				'an authorised push-payment scam: the customer is being coached to pay a “safe account”',
			finding:
				'day -1 CRM: customer phoned asking how to send a large payment to an investment; a “broker” was helping'
		}),
		heldGenuine: (n: number): FraudAlert => ({
			...base(n),
			amount: 950,
			merchant: 'Faster payment',
			category: 'transfer',
			channel: 'app',
			device: usualDevice,
			time: '09:15',
			velocity: 1,
			payee: 'LETTINGS — the rent',
			label: 'legitimate',
			reason: 'the usual rent payment from the usual device, held by an over-cautious rule',
			finding: 'day -30 LETTINGS £950 (monthly, usual)'
		}),
		mask: (accountId: string): string => {
			const account = bank.accounts.find((a) => a.id === accountId);
			return account ? mask(account) : accountId;
		}
	};
}

export function alertRecord(alert: FraudAlert, masked: string): DeskRecord {
	return {
		id: `alert-${alert.n}`,
		kind: 'alert',
		title: `Alert ${alert.n}`,
		classification: 'personal',
		fields: {
			account: masked,
			amount: alert.amount,
			direction: alert.direction,
			merchant: alert.merchant,
			category: alert.category,
			channel: alert.channel,
			device: alert.device ?? 'unknown',
			country: alert.country,
			time: alert.time,
			velocity: alert.velocity,
			payee: alert.payee ?? ''
		}
	};
}

export const summaryOf = (alert: FraudAlert): string =>
	`${alert.direction === 'credit' ? '+' : '-'}£${alert.amount.toLocaleString('en-GB')} ${alert.merchant}${alert.payee ? ` → ${alert.payee}` : ''} at ${alert.time}`;
