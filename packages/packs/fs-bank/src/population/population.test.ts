import { checkSynthetic } from '@craftabot/pack-testkit';
import { describe, expect, it } from 'vitest';
import { bankRecords } from '../records.js';
import { customerCase, population, sampleOrdinals } from './population.js';
import { accountDaySeed, customerSeed } from './seeds.js';
import { sha256Hex } from './sha256.js';

/**
 * **The population's promises** (WP74 stage B, `66-CALIBRATION.md` §4.3
 * and §4.5; `65-…` WP74's DoD): the same seed is the same digest; customer
 * *k* is identical across sizes; `between` equals the concatenation of
 * `forAccount`; the digest for the shipped seed is asserted; a 20,000-
 * customer population is made in a stated time; a 1,000 sample passes the
 * synthetic sweep.
 */
/**
 * `population(1, { size: 2000 })` on the shipped table: a change to a row, a
 * generator or the calendar moves it, and moves it deliberately. Moved once
 * already, the same day: WP75 added the books' eight rows to the table the
 * digest covers (751e525c… → 44fe315c…); the customers themselves did not
 * change, as the size-invariance test shows.
 */
// Moved once more 2026-09-11 (WP83, `71-…` §3): the clock's two rows joined the table (44fe315c… → 7a875392…); the customers did not move.
const SHIPPED_DIGEST = '7a875392c383350312fa5674a82d3c385238a9c70212b34cf8c58eb7942007af';

describe('sha256Hex', () => {
	it('matches the standard vectors and Web Crypto', async () => {
		expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
		expect(sha256Hex('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
		const text = 'a population, canonical, with ünïcödé and a long tail '.repeat(40);
		const bytes = new TextEncoder().encode(text);
		const expected = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
			b.toString(16).padStart(2, '0')
		).join('');
		expect(sha256Hex(text)).toBe(expected);
	});
});

describe('the seeds', () => {
	it('are fixed vectors, distinct across customers, accounts and days', () => {
		expect(customerSeed(1, 0)).toBe(customerSeed(1, 0));
		expect(customerSeed(1, 0)).not.toBe(customerSeed(1, 1));
		expect(customerSeed(1, 0)).not.toBe(customerSeed(2, 0));
		expect(accountDaySeed(customerSeed(1, 0), 0, 0)).not.toBe(
			accountDaySeed(customerSeed(1, 0), 0, 1)
		);
		expect(accountDaySeed(customerSeed(1, 0), 0, 0)).not.toBe(
			accountDaySeed(customerSeed(1, 0), 1, 0)
		);
		expect(sampleOrdinals(20)).toEqual([0, 1, 2, 3, 5, 8, 13]);
	});
});

describe('population', () => {
	const small = population(1, { size: 200 });

	it('the same seed is the same population, and the digest moves with the seed, the size and the calendar', () => {
		expect(population(1, { size: 200 }).digest).toBe(small.digest);
		expect(population(2, { size: 200 }).digest).not.toBe(small.digest);
		expect(population(1, { size: 201 }).digest).not.toBe(small.digest);
		expect(population(1, { size: 200, startDate: '2026-02-02' }).digest).not.toBe(small.digest);
		expect(small.customers).toHaveLength(200);
		expect(new Set(small.customers.map((c) => c.customer.id)).size).toBe(200);
	});

	it('customer k is identical across sizes', () => {
		const larger = population(1, { size: 400 });
		for (const k of [0, 1, 7, 199]) {
			expect(JSON.stringify(larger.customers[k])).toBe(JSON.stringify(small.customers[k]));
		}
		// And the transactions: the same account, the same day, the same rows.
		const account = small.customers[3]!.accounts[0]!;
		expect(larger.transactions.forAccount(account.id, 10)).toEqual(
			small.transactions.forAccount(account.id, 10)
		);
	});

	it('between equals the concatenation of forAccount, day by day, account by account', () => {
		const from = small.transactions.dateOf(5);
		const to = small.transactions.dateOf(9);
		const viaBetween = [...small.transactions.between(from, to)];
		const viaForAccount: typeof viaBetween = [];
		for (let dayIndex = 5; dayIndex <= 9; dayIndex += 1) {
			for (const entry of small.customers) {
				for (const account of entry.accounts) {
					viaForAccount.push(...small.transactions.forAccount(account.id, dayIndex));
				}
			}
		}
		expect(viaBetween).toEqual(viaForAccount);
		expect(viaBetween.length).toBeGreaterThan(0);
		expect(viaBetween.every((t) => t.date !== undefined && t.date >= from && t.date <= to)).toBe(
			true
		);
		// A day out of the calendar is empty, and so is an unknown account.
		expect(small.transactions.forAccount(small.customers[0]!.accounts[0]!.id, 999)).toEqual([]);
		expect(small.transactions.forAccount('acct-nobody', 1)).toEqual([]);
		expect(small.transactions.indexOf(small.transactions.dateOf(42))).toBe(42);
	});

	it('customerCase hands a desk the last thirty days in bankCase’s shape', () => {
		const id = small.customers[5]!.customer.id;
		const asCase = customerCase(small, id);
		expect(asCase.customer).toEqual(small.customers[5]!.customer);
		expect(asCase.shelf).toHaveLength(30);
		expect(asCase.transactions.every((t) => t.day >= 0 && t.day < 30)).toBe(true);
		expect(
			asCase.transactions.every((t) => asCase.accounts.some((a) => a.id === t.accountId))
		).toBe(true);
		expect(() => customerCase(small, 'cust-nobody')).toThrow(/no customer/);
		expect(() => population(1, { size: 0 })).toThrow(/positive integer/);
	});

	it('the shipped seed’s digest is what it was — a change to a row, a generator or the calendar is deliberate', () => {
		const shipped = population(1, { size: 2_000 });
		expect(shipped.digest).toBe(SHIPPED_DIGEST);
	});

	it(
		'twenty thousand customers generate in a stated time, and a thousand of them pass the synthetic sweep',
		{ timeout: 240_000 },
		() => {
			const started = performance.now();
			const large = population(1, { size: 20_000 });
			const elapsed = performance.now() - started;
			console.log(`population(1, { size: 20000 }) in ${Math.round(elapsed)} ms`);
			expect(large.customers).toHaveLength(20_000);
			expect(elapsed).toBeLessThan(60_000);
			const sample = large.customers
				.filter((_, index) => index % 20 === 0)
				.map((entry) => {
					const asCase = customerCase(large, entry.customer.id, 7);
					return { ...asCase, records: bankRecords(asCase) };
				});
			expect(sample).toHaveLength(1_000);
			const issues = checkSynthetic([
				{ path: 'population.json', text: JSON.stringify(sample) },
				{ path: 'population.jsonl', text: sample.map((c) => JSON.stringify(c)).join('\n') }
			]);
			expect(issues.map((issue) => issue.message)).toEqual([]);
		}
	);
});
