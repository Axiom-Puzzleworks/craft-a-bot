import { calibrationRow, type Book } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { adviceRequestBook, complaintBook } from './book/registers.js';
import { alertBook } from './book/books.js';
import { arrivals, bankClock, defaultArrivalRates, itemSeed, type ClockOptions } from './clock.js';
import { population } from './population/population.js';

/**
 * **The clock and the registers** (WP83, `71-THE-CLOCK.md` §6): two clocks
 * from one seed emit the same arrivals whatever the acceleration; the list
 * is by time; thinning keeps its share; an alert keeps its transaction's
 * time; the `arrival-rates` row is read off the arrivals; the registers
 * draw the same items every time and only inside the window.
 */
const pop = population(1, { size: 2_000 });
const from = pop.transactions.dateOf(150);
const to = pop.transactions.dateOf(179);
const books: Book[] = [
	alertBook(pop, { from, to, customers: 100 }).book,
	complaintBook(pop, { from, to }),
	adviceRequestBook(pop, { from, to })
];
const base: ClockOptions = { population: pop, from, to, books, acceleration: Infinity, seed: 7 };

describe('the bank clock', { timeout: 120_000 }, () => {
	it('emits one list from one seed, whatever the acceleration, by time', async () => {
		const fast = arrivals(base);
		expect(fast.length).toBeGreaterThan(20);
		for (let i = 1; i < fast.length; i += 1) {
			expect(fast[i]!.at >= fast[i - 1]!.at).toBe(true);
			expect(fast[i]!.ordinal).toBe(i);
		}
		const paced: string[] = [];
		// A finite acceleration so large the waits round to nothing: the same list, through the async door.
		for await (const arrival of bankClock({ ...base, acceleration: 1e12 }))
			paced.push(arrival.item.id);
		expect(paced).toEqual(fast.map((arrival) => arrival.item.id));
		expect(JSON.stringify(arrivals({ ...base, acceleration: 60 }))).toBe(JSON.stringify(fast));
		expect(arrivals({ ...base, seed: 8 }).map((a) => a.at)).not.toEqual(fast.map((a) => a.at));
	});

	it('keeps an alert at its transaction’s time, places the rest by the hour profile, and thins by the scale', () => {
		const list = arrivals(base);
		const alerts = list.filter((arrival) => arrival.item.kind === 'alert');
		for (const alert of alerts) expect(alert.at).toBe(alert.item.arrivedAt);
		const placed = list.filter((arrival) => arrival.item.kind !== 'alert');
		expect(placed.length).toBeGreaterThan(5);
		const hours = placed.map((arrival) => Number(arrival.at.slice(11, 13)));
		// The profile is a working day: nothing before eight or after twenty.
		expect(Math.min(...hours)).toBeGreaterThanOrEqual(8);
		expect(Math.max(...hours)).toBeLessThanOrEqual(20);
		const thinned = arrivals({
			...base,
			rates: { complaint: { profile: defaultArrivalRates(pop).complaint.profile, scale: 0 } }
		});
		expect(thinned.some((arrival) => arrival.item.kind === 'complaint')).toBe(false);
		expect(thinned.filter((a) => a.item.kind === 'alert')).toHaveLength(alerts.length);
		// Outside the window, nothing.
		expect(
			arrivals({ ...base, from: pop.transactions.dateOf(0), to: pop.transactions.dateOf(10) })
		).toEqual([]);
	});

	it('reads the arrival-rates row off a long window of placed arrivals', () => {
		const wide = arrivals({
			...base,
			from: pop.transactions.dateOf(0),
			to: pop.transactions.dateOf(179),
			books: [
				complaintBook(pop, { from: pop.transactions.dateOf(0), to }),
				adviceRequestBook(pop, { from: pop.transactions.dateOf(0), to })
			]
		});
		expect(wide.length).toBeGreaterThan(100);
		const row = calibrationRow(pop.options.calibration, 'arrival-rates');
		const total = Object.values(row.distribution).reduce((sum, w) => sum + w, 0);
		const counts = new Array<number>(24).fill(0);
		for (const arrival of wide) {
			const hour = Number(arrival.at.slice(11, 13));
			counts[hour] = (counts[hour] ?? 0) + 1;
		}
		for (let hour = 0; hour < 24; hour += 1) {
			const expected = (row.distribution[`h${hour}`] ?? 0) / total;
			expect(Math.abs(counts[hour]! / wide.length - expected), `h${hour}`).toBeLessThanOrEqual(
				row.tolerance
			);
		}
	});

	it('the item seed is a function of the bank seed and the id alone', () => {
		expect(itemSeed(1, 'a')).toBe(itemSeed(1, 'a'));
		expect(itemSeed(1, 'a')).not.toBe(itemSeed(2, 'a'));
		expect(itemSeed(1, 'a')).not.toBe(itemSeed(1, 'b'));
	});
});

describe('the registers', { timeout: 120_000 }, () => {
	it('draw the complaints opened in the window and the advice requests of savings holders, the same every time', () => {
		const complaints = complaintBook(pop, { from, to });
		expect(complaints.kind).toBe('complaint');
		expect(complaints.items.length).toBeGreaterThan(0);
		for (const item of complaints.items) {
			expect(item.arrivedAt.slice(0, 10) >= from && item.arrivedAt.slice(0, 10) <= to).toBe(true);
			expect(typeof item.truth.facts?.['upheld']).toBe('boolean');
		}
		expect(JSON.stringify(complaintBook(pop, { from, to }))).toBe(JSON.stringify(complaints));
		const advice = adviceRequestBook(pop, { from, to });
		expect(advice.kind).toBe('advice-request');
		expect(advice.items.length).toBeGreaterThan(0);
		for (const item of advice.items) {
			const payload = item.payload as {
				savingsBalance: number;
				customer: { cohort: { protectedProxies: string[] } };
			};
			expect(payload.savingsBalance).toBeGreaterThanOrEqual(1000);
			expect(payload.customer.cohort.protectedProxies).toEqual([]);
		}
		expect(JSON.stringify(adviceRequestBook(pop, { from, to }))).toBe(JSON.stringify(advice));
		// The advice-request-incidence row: the share of savings holders asking in thirty days.
		const row = calibrationRow(pop.options.calibration, 'advice-request-incidence');
		const holders = pop.customers.filter((entry) =>
			entry.accounts.some(
				(account) =>
					account.kind === 'savings' && account.status === 'open' && account.balance >= 1000
			)
		).length;
		expect(
			Math.abs(advice.items.length / holders - row.distribution['requests']!)
		).toBeLessThanOrEqual(row.tolerance);
	});
});
