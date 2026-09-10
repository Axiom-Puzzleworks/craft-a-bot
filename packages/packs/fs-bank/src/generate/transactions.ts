import type { Account, Transaction, TransactionChannel } from '../model.js';
import { calibrationRow } from '@craftabot/core';
import { hexId, pick, rateOf, tableOf, weightedRow, type Calibrated } from './customer.js';
import { MERCHANTS } from './vocab.js';

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * A history for every account: mostly the account's own baseline — its
 * merchants, its devices, its country — at its typical amounts, with a few
 * departures a desk can read as signals (a new device, a foreign country, a
 * burst of card-not-present spend at night). Deterministic per seed; the
 * desks decide what any departure *means* (an alert's label is truth the
 * desk generates, never something the history asserts).
 */
export function generateTransactions(
	random: () => number,
	accounts: readonly Account[],
	options: { perAccount?: number; days?: number } & Calibrated = {}
): Transaction[] {
	const perAccount = options.perAccount ?? 24;
	const days = options.days ?? 30;
	const rates = ratesOf(tableOf(options));
	const out: Transaction[] = [];
	for (const account of accounts) {
		if (account.kind === 'loan' || account.kind === 'mortgage') continue;
		const byHour = new Map<string, number>();
		for (let i = 0; i < perAccount; i += 1) {
			// The day is drawn here, in the order it always was; a population's day is given (`dayTransactions`).
			out.push(oneTransaction(random, account, byHour, rates, () => Math.floor(random() * days)));
		}
	}
	return out.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}

interface TransactionRates {
	departureRate: number;
	creditShare: number;
	cardMix: ReturnType<typeof calibrationRow>;
	currentMix: ReturnType<typeof calibrationRow>;
}

function ratesOf(table: ReturnType<typeof tableOf>): TransactionRates {
	return {
		departureRate: rateOf(calibrationRow(table, 'transaction-departure'), 'departure'),
		creditShare: rateOf(calibrationRow(table, 'transaction-credit-share'), 'credit'),
		cardMix: calibrationRow(table, 'channel-mix-card'),
		currentMix: calibrationRow(table, 'channel-mix-current')
	};
}

/** One transaction on an account: every draw in the order `generateTransactions` has always made them. */
function oneTransaction(
	random: () => number,
	account: Account,
	byHour: Map<string, number>,
	rates: TransactionRates,
	dayOf: () => number,
	date?: string
): Transaction {
	const departure = random() < rates.departureRate;
	const category = departure
		? pick(random, Object.keys(MERCHANTS))
		: pick(random, account.baseline.merchantCategories);
	const merchant = pick(random, MERCHANTS[category] ?? ['Unknown Merchant']);
	const day = dayOf();
	const hour =
		departure && random() < 0.5 ? Math.floor(random() * 6) : 7 + Math.floor(random() * 15);
	const minute = Math.floor(random() * 60);
	const hourKey = `${day}:${hour}`;
	const velocity = (byHour.get(hourKey) ?? 0) + 1;
	byHour.set(hourKey, velocity);
	const channel: TransactionChannel =
		category === 'cash-withdrawal'
			? 'atm'
			: category === 'utilities' || category === 'subscriptions'
				? 'direct-debit'
				: account.kind === 'credit-card'
					? weightedRow<TransactionChannel>(random, rates.cardMix)
					: weightedRow<TransactionChannel>(random, rates.currentMix);
	const typical = account.baseline.typicalTransaction;
	const amount = departure
		? Math.round(typical * (3 + random() * 12))
		: Math.max(1, Math.round(typical * (0.3 + random() * 1.7)));
	const device =
		channel === 'card-present' || channel === 'atm'
			? undefined
			: departure && random() < 0.5
				? 'app on a new phone'
				: pick(random, account.baseline.devices);
	const country =
		departure && random() < 0.3 ? pick(random, ['France', 'Spain', 'Portugal']) : 'United Kingdom';
	return {
		id: hexId(random, 'txn'),
		accountId: account.id,
		day,
		...(date !== undefined ? { date } : {}),
		time: `${pad(hour)}:${pad(minute)}`,
		amount,
		direction: random() < rates.creditShare ? 'credit' : 'debit',
		merchant,
		merchantCategory: category,
		channel,
		...(device ? { device } : {}),
		country,
		...(channel === 'faster-payment'
			? { payee: departure ? 'a new payee' : pick(random, account.baseline.payees) }
			: {}),
		velocity
	};
}

/**
 * **One account's day** (WP74 stage B, `66-…` §4.3): the population's
 * lazy stream calls this per account per calendar day with a seed of its
 * own. The count is Poisson at the same rate as `bankCase` — 24 per 30
 * days, the `payments-per-account` row's shape — so a day usually has
 * none or one, sometimes a few. The day is given, not drawn; the rest of
 * the draws are `oneTransaction`'s.
 */
export function dayTransactions(
	random: () => number,
	account: Account,
	options: { day: number; date: string; perAccount?: number; days?: number } & Calibrated
): Transaction[] {
	if (account.kind === 'loan' || account.kind === 'mortgage') return [];
	const mean = (options.perAccount ?? 24) / (options.days ?? 30);
	const rates = ratesOf(tableOf(options));
	// Poisson by inversion.
	const limit = Math.exp(-mean);
	let count = 0;
	let p = random();
	while (p > limit) {
		count += 1;
		p *= random();
	}
	const byHour = new Map<string, number>();
	const out: Transaction[] = [];
	for (let i = 0; i < count; i += 1) {
		out.push(oneTransaction(random, account, byHour, rates, () => options.day, options.date));
	}
	return out.sort((a, b) => a.time.localeCompare(b.time));
}
