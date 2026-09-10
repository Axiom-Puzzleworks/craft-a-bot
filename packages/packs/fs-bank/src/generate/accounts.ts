import {
	syntheticAccountNumber,
	syntheticIban,
	syntheticName,
	syntheticPan,
	syntheticSortCode
} from '@craftabot/desk';
import type { Account, AccountBaseline, AccountKind, Customer } from '../model.js';
import { calibrationRow } from '@craftabot/core';
import {
	hexId,
	INCOME_BAND_INDEX,
	pick,
	rateOf,
	tableOf,
	weightedRow,
	type Calibrated
} from './customer.js';
import { COUNTRIES, MERCHANT_CATEGORIES } from './vocab.js';

/** Roughly a month's income at the band's midpoint. */
export function monthlyIncomeOf(customer: Customer): number {
	const bands = [1000, 1700, 2700, 4200, 6500, 10000];
	return bands[INCOME_BAND_INDEX(customer.cohort.incomeBand)] ?? 1000;
}

function baseline(random: () => number, customer: Customer, kind: AccountKind): AccountBaseline {
	const income = monthlyIncomeOf(customer);
	const spend =
		kind === 'current' ? Math.round(income * (0.6 + random() * 0.3)) : Math.round(income * 0.1);
	const categories = [...MERCHANT_CATEGORIES]
		.filter((category) => category !== 'gambling' && category !== 'crypto')
		.filter(() => random() < 0.5)
		.slice(0, 5);
	const usualDevice =
		customer.digitalConfidence === 'low' ? 'card at a terminal' : 'app on the usual phone';
	return {
		typicalMonthlySpend: spend,
		typicalTransaction: Math.max(5, Math.round(spend / 25)),
		merchantCategories: categories.length > 0 ? categories : ['groceries'],
		devices: [usualDevice, ...(random() < 0.5 ? ['web on the usual laptop'] : [])],
		countries: ['United Kingdom', ...(random() < 0.2 ? [pick(random, COUNTRIES.slice(1))] : [])],
		payees: Array.from({ length: 1 + Math.floor(random() * 3) }, () => syntheticName(random).full)
	};
}

export function generateAccounts(
	random: () => number,
	customer: Customer,
	options?: Calibrated
): Account[] {
	const table = tableOf(options);
	const holding = calibrationRow(table, 'product-holding');
	const income = monthlyIncomeOf(customer);
	const kinds: AccountKind[] = ['current'];
	if (random() < rateOf(calibrationRow(table, 'savings-holding'), 'savings')) kinds.push('savings');
	if (random() < rateOf(holding, 'credit-card')) kinds.push('credit-card');
	if (random() < rateOf(holding, 'loan')) kinds.push('loan');
	if (customer.employment !== 'student' && random() < rateOf(holding, 'mortgage'))
		kinds.push('mortgage');
	const openedFrom = 2026 - customer.tenureYears;
	return kinds.map((kind): Account => {
		const sortCode = syntheticSortCode(random);
		const accountNumber = syntheticAccountNumber(random);
		const base: Account = {
			id: hexId(random, 'acct'),
			customerId: customer.id,
			kind,
			sortCode,
			accountNumber,
			balance: 0,
			openedYear: openedFrom + Math.floor(random() * Math.max(1, 2026 - openedFrom)),
			status: 'open',
			baseline: baseline(random, customer, kind)
		};
		switch (kind) {
			case 'current':
				return {
					...base,
					iban: syntheticIban(random),
					balance: Math.round(income * (random() * 1.5 - 0.2))
				};
			case 'savings':
				return {
					...base,
					balance: Math.round(income * random() * 12),
					interestRateBps: Number(weightedRow(random, calibrationRow(table, 'savings-rate-bps')))
				};
			case 'credit-card': {
				const limit = Number(weightedRow(random, calibrationRow(table, 'credit-limit')));
				return {
					...base,
					pan: syntheticPan(random),
					creditLimit: limit,
					balance: -Math.round(limit * random() * 0.8),
					interestRateBps: 2290
				};
			}
			case 'loan':
				return {
					...base,
					balance: -Math.round(income * (3 + random() * 12)),
					interestRateBps: 690
				};
			case 'mortgage':
				return {
					...base,
					balance: -Math.round(income * (30 + random() * 40)),
					interestRateBps: 450
				};
		}
	});
}
