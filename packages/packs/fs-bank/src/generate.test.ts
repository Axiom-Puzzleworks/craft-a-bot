import { checkSynthetic } from '@craftabot/pack-testkit';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bankCase } from './generate/case.js';
import { AGE_BANDS, INCOME_BANDS } from './model.js';
import { bankRecords } from './records.js';

/**
 * The generators (WP59 stage A, `48-FS-BANK.md` §4.2–§4.3): the same seed is
 * the same bank; a thousand seeds are a thousand customers and pass the
 * synthetic sweep; the records the bank hands a desk carry the bank's
 * classifications and keep the cohort and the undisclosed drivers for
 * truth alone; the pack ships no runtime.
 */
const SEEDS = Array.from({ length: 1000 }, (_, i) => i + 1);
/** Generated once: a thousand cases with their transactions is the slow part of this file. */
const CASES = SEEDS.map((seed) => bankCase(seed));

describe('bankCase', () => {
	it('is deterministic: the same seed is the same case, byte for byte', () => {
		expect(bankCase(7)).toEqual(bankCase(7));
		expect(JSON.stringify(bankCase(7))).toBe(JSON.stringify(bankCase(7)));
		expect(bankCase(7).customer.id).not.toBe(bankCase(8).customer.id);
	});

	it(
		'a thousand seeds are a thousand distinct customers with sound shapes',
		{ timeout: 60_000 },
		() => {
			const cases = CASES;
			expect(new Set(cases.map((c) => c.customer.id)).size).toBe(1000);
			for (const c of cases) {
				expect(AGE_BANDS).toContain(c.customer.cohort.ageBand);
				expect(INCOME_BANDS).toContain(c.customer.cohort.incomeBand);
				expect(c.customer.cohort.protectedProxies.length).toBeGreaterThan(0);
				expect(c.accounts[0]?.kind).toBe('current');
				expect(c.accounts.every((a) => a.customerId === c.customer.id)).toBe(true);
				expect(c.transactions.every((t) => c.accounts.some((a) => a.id === t.accountId))).toBe(
					true
				);
				expect(c.bureau.customerId).toBe(c.customer.id);
				expect(c.shelf).toHaveLength(30);
				// Disclosed drivers are a subset of the actual ones.
				for (const key of ['health', 'lifeEvents', 'resilience', 'capability'] as const) {
					for (const driver of c.customer.disclosed[key]) {
						expect(c.customer.vulnerability[key]).toContain(driver);
					}
				}
				// Born consistent with the band.
				const age = 2026 - c.customer.dateOfBirthYear;
				expect(age).toBeGreaterThanOrEqual(18);
			}
			// The distributions are not degenerate: every band appears somewhere.
			expect(new Set(cases.map((c) => c.customer.cohort.ageBand)).size).toBe(AGE_BANDS.length);
			expect(new Set(cases.map((c) => c.customer.employment)).size).toBeGreaterThan(4);
			expect(cases.some((c) => c.complaints.length > 0)).toBe(true);
			expect(cases.some((c) => c.bureau.defaults > 0)).toBe(true);
		}
	);

	it(
		'a thousand cases, their records and their truth pass the synthetic sweep (hard rule 9)',
		{ timeout: 120_000 },
		() => {
			const cases = SEEDS.map((seed) => ({
				...bankCase(seed),
				records: bankRecords(bankCase(seed))
			}));
			const issues = checkSynthetic([
				{ path: 'cases.json', text: JSON.stringify(cases, null, 2) },
				{ path: 'cases.jsonl', text: cases.map((c) => JSON.stringify(c)).join('\n') }
			]);
			expect(issues.map((issue) => issue.message)).toEqual([]);
		}
	);
});

describe('bankRecords', () => {
	it('classifies every record, hides what a look-up earns, and keeps the cohort for truth alone', () => {
		const bank = bankCase(42);
		const { revealed, hidden, truth } = bankRecords(bank);
		expect(revealed.every((r) => r.classification === 'public')).toBe(true);
		expect(revealed.map((r) => r.kind)).toEqual(['notice', ...Array(30).fill('product')]);
		expect(hidden.every((r) => r.classification !== undefined)).toBe(true);
		expect(hidden.find((r) => r.id === 'vulnerability')?.classification).toBe('special-category');
		expect(hidden.find((r) => r.id === 'customer')?.classification).toBe('personal');
		// The cohort's proxies and the undisclosed drivers appear in truth and nowhere else.
		const visible = JSON.stringify([...revealed, ...hidden]);
		for (const proxy of bank.customer.cohort.protectedProxies) expect(visible).not.toContain(proxy);
		expect(JSON.stringify(truth)).toContain(bank.customer.cohort.protectedProxies[0]);
		expect(truth.facts?.cohortKey).toContain('ageBand=');
		// An account number is masked on the desk.
		const account = hidden.find((r) => r.kind === 'account');
		expect(String(account?.fields['account_number'])).toMatch(/^••••\d{4}$/);
	});
});

describe('the pack ships no runtime', () => {
	it('never implements a world: no createDeskWorld, observe, perform or inject in src/', () => {
		const files: string[] = [];
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const path = join(dir, name);
				if (statSync(path).isDirectory()) walk(path);
				else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) files.push(path);
			}
		};
		walk(join(import.meta.dirname));
		expect(files.length).toBeGreaterThan(5);
		for (const file of files) {
			const text = readFileSync(file, 'utf8');
			for (const forbidden of ['createDeskWorld', 'observe(', 'perform(', 'inject(']) {
				expect(text, `${file} contains ${forbidden}`).not.toContain(forbidden);
			}
		}
	});
});
