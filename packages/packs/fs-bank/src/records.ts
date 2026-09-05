import type { DeskRecord } from '@craftabot/core';
import type { DeskTruth } from '@craftabot/desk';
import type { Account, BankCase, Transaction, VulnerabilityDrivers } from './model.js';

/**
 * **The bank's opinion of a case file** (WP59, `48-FS-BANK.md` §4.3): what a
 * desk should start with — every record classified (`personal`,
 * `special-category`, `public`), what a look-up may earn in `hidden`, what
 * is on the desk in `revealed`, and the truth nobody at the desk can see.
 * A desk reshapes this; the classification is the bank's, not the desk's.
 */
export interface BankRecords {
	revealed: DeskRecord[];
	hidden: DeskRecord[];
	truth: DeskTruth;
}

const mask = (accountNumber: string): string => `••••${accountNumber.slice(-4)}`;

export function driverList(drivers: VulnerabilityDrivers): string {
	const all = [
		...drivers.health.map((d) => `health: ${d}`),
		...drivers.lifeEvents.map((d) => `life event: ${d}`),
		...drivers.resilience.map((d) => `resilience: ${d}`),
		...drivers.capability.map((d) => `capability: ${d}`)
	];
	return all.length === 0 ? 'none' : all.join('; ');
}

export function hasAnyDriver(drivers: VulnerabilityDrivers): boolean {
	return (
		drivers.health.length +
			drivers.lifeEvents.length +
			drivers.resilience.length +
			drivers.capability.length >
		0
	);
}

function accountRecord(account: Account): DeskRecord {
	return {
		id: `account-${account.id}`,
		kind: 'account',
		title: `${labelOf(account.kind)} ${mask(account.accountNumber)}`,
		classification: 'personal',
		fields: {
			kind: account.kind,
			sort_code: account.sortCode,
			account_number: mask(account.accountNumber),
			balance: account.balance,
			...(account.creditLimit !== undefined ? { credit_limit: account.creditLimit } : {}),
			status: account.status,
			opened: account.openedYear
		}
	};
}

const labelOf = (kind: Account['kind']): string =>
	({
		current: 'Current account',
		savings: 'Savings account',
		'credit-card': 'Credit card',
		loan: 'Loan',
		mortgage: 'Mortgage'
	})[kind];

function transactionsRecord(account: Account, transactions: readonly Transaction[]): DeskRecord {
	const recent = transactions.filter((t) => t.accountId === account.id).slice(-8);
	return {
		id: `transactions-${account.id}`,
		kind: 'transactions',
		title: `Recent activity — ${labelOf(account.kind)} ${mask(account.accountNumber)}`,
		classification: 'personal',
		fields: Object.fromEntries(
			recent.map((t, i) => [
				`t${i + 1}`,
				`day -${t.day} ${t.time} ${t.direction === 'debit' ? '-' : '+'}£${t.amount} ${t.merchant} (${t.channel}${t.device ? `, ${t.device}` : ''}${t.country !== 'United Kingdom' ? `, ${t.country}` : ''})`
			])
		)
	};
}

export function bankRecords(bank: BankCase): BankRecords {
	const { customer } = bank;
	const identity: DeskRecord = {
		id: 'customer',
		kind: 'customer',
		title: customer.name.full,
		classification: 'personal',
		fields: {
			name: customer.name.full,
			born: customer.dateOfBirthYear,
			address: `${customer.address.line1}, ${customer.address.town}, ${customer.address.postcode}`,
			email: customer.email,
			phone: customer.phone,
			employment: customer.employment,
			...(customer.employer ? { employer: customer.employer } : {}),
			dependants: customer.dependants,
			tenure_years: customer.tenureYears,
			preferred_channel: customer.consent.preferredChannel,
			marketing_consent: customer.consent.marketing
		}
	};
	const vulnerability: DeskRecord = {
		id: 'vulnerability',
		kind: 'vulnerability',
		title: 'Support needs and circumstances on file',
		classification: 'special-category',
		fields: {
			disclosed: driverList(customer.disclosed),
			support_needs: customer.cohort.supportNeeds
		}
	};
	const bureau: DeskRecord = {
		id: 'bureau',
		kind: 'bureau',
		title: 'Credit bureau file',
		classification: 'personal',
		fields: {
			score_band: bank.bureau.scoreBand,
			defaults: bank.bureau.defaults,
			arrears_months: bank.bureau.arrearsMonths,
			searches_12m: bank.bureau.searchesLast12m,
			monthly_income: bank.bureau.affordability.monthlyIncome,
			monthly_commitments: bank.bureau.affordability.monthlyCommitments,
			disposable: bank.bureau.affordability.disposable
		}
	};
	const complaints: DeskRecord[] = bank.complaints.map((complaint) => ({
		id: `complaint-${complaint.id}`,
		kind: 'complaint',
		title: `Complaint — ${complaint.category}`,
		classification: 'personal',
		fields: {
			opened: `day -${complaint.openedDay}`,
			status: complaint.status,
			summary: complaint.summary
		}
	}));
	const products: DeskRecord[] = bank.shelf.map((product) => ({
		id: product.id.replace('fs-bank/product/', 'product-'),
		kind: 'product',
		title: product.name,
		classification: 'public',
		fields: {
			category: product.category,
			risk_band: product.riskBand,
			annual_charge_bps: product.priceBps,
			target_market: product.targetMarket,
			factsheet: product.factsheet,
			warnings: product.warnings.join(' ')
		}
	}));
	const notice: DeskRecord = {
		id: 'notice',
		kind: 'notice',
		title: 'The bank',
		classification: 'public',
		fields: {
			text: 'A synthetic high-street bank. Every customer, account and transaction here is generated; nothing is real.'
		}
	};
	const truth: DeskTruth = {
		records: [
			{
				id: 'cohort',
				kind: 'cohort',
				title: 'Cohort (truth)',
				fields: {
					age_band: customer.cohort.ageBand,
					income_band: customer.cohort.incomeBand,
					protected_proxies: customer.cohort.protectedProxies.join(','),
					support_needs: customer.cohort.supportNeeds,
					literacy_band: customer.cohort.literacyBand
				}
			},
			{
				id: 'vulnerability-actual',
				kind: 'vulnerability',
				title: 'Vulnerability (truth)',
				fields: { actual: driverList(customer.vulnerability) }
			}
		],
		facts: {
			vulnerable: hasAnyDriver(customer.vulnerability),
			cohortKey: `ageBand=${customer.cohort.ageBand};incomeBand=${customer.cohort.incomeBand}`
		}
	};
	return {
		revealed: [notice, ...products],
		hidden: [
			identity,
			...bank.accounts.map(accountRecord),
			...bank.accounts
				.filter((account) => account.kind !== 'loan' && account.kind !== 'mortgage')
				.map((account) => transactionsRecord(account, bank.transactions)),
			...complaints,
			vulnerability,
			bureau
		],
		truth
	};
}
