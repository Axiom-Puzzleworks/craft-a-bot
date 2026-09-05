import type { Account, Transaction, TransactionChannel } from '../model.js';
import { hexId, pick, weighted } from './customer.js';
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
	options: { perAccount?: number; days?: number } = {}
): Transaction[] {
	const perAccount = options.perAccount ?? 24;
	const days = options.days ?? 30;
	const out: Transaction[] = [];
	for (const account of accounts) {
		if (account.kind === 'loan' || account.kind === 'mortgage') continue;
		const byHour = new Map<string, number>();
		for (let i = 0; i < perAccount; i += 1) {
			const departure = random() < 0.12;
			const category = departure
				? pick(random, Object.keys(MERCHANTS))
				: pick(random, account.baseline.merchantCategories);
			const merchant = pick(random, MERCHANTS[category] ?? ['Unknown Merchant']);
			const day = Math.floor(random() * days);
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
							? weighted(random, [
									['card-present', 6],
									['card-not-present', 4]
								])
							: weighted(random, [
									['card-present', 5],
									['card-not-present', 3],
									['faster-payment', 2]
								]);
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
				departure && random() < 0.3
					? pick(random, ['France', 'Spain', 'Portugal'])
					: 'United Kingdom';
			out.push({
				id: hexId(random, 'txn'),
				accountId: account.id,
				day,
				time: `${pad(hour)}:${pad(minute)}`,
				amount,
				direction: random() < 0.08 ? 'credit' : 'debit',
				merchant,
				merchantCategory: category,
				channel,
				...(device ? { device } : {}),
				country,
				...(channel === 'faster-payment'
					? { payee: departure ? 'a new payee' : pick(random, account.baseline.payees) }
					: {}),
				velocity
			});
		}
	}
	return out.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
}
