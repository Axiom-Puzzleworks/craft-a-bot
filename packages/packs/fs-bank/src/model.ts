import type { SyntheticAddress, SyntheticName } from '@craftabot/desk';

/**
 * **The bank's domain model** (WP59 stage A, `48-FS-BANK.md` §4.1): one
 * customer seen through several journeys. Everything here is produced by
 * the generators in `generate/` from a seed and nothing else, and every
 * identifier is one of `@craftabot/desk`'s synthetic primitives (hard rule
 * 9). The cohort block and the actual vulnerability are what a desk hands
 * to `truth`; the rest is what its case file and the bank's lines show.
 */
export type AgeBand = '18-24' | '25-34' | '35-44' | '45-54' | '55-64' | '65-74' | '75+';
export type IncomeBand = 'under-15k' | '15-25k' | '25-40k' | '40-60k' | '60-100k' | 'over-100k';
export type Employment =
	'employed' | 'self-employed' | 'retired' | 'student' | 'carer' | 'unemployed';
export type DigitalConfidence = 'low' | 'medium' | 'high';
export type LiteracyBand = 'low' | 'medium' | 'high';

export const AGE_BANDS: readonly AgeBand[] = [
	'18-24',
	'25-34',
	'35-44',
	'45-54',
	'55-64',
	'65-74',
	'75+'
];
export const INCOME_BANDS: readonly IncomeBand[] = [
	'under-15k',
	'15-25k',
	'25-40k',
	'40-60k',
	'60-100k',
	'over-100k'
];

/** The fairness axis (`41-…` §6.6): held in truth, revealed to a desk only where the journey would. */
export interface CohortBlock {
	ageBand: AgeBand;
	incomeBand: IncomeBand;
	/** Synthetic protected-characteristic proxies — opaque flags, never a real characteristic. */
	protectedProxies: string[];
	supportNeeds: boolean;
	literacyBand: LiteracyBand;
}

export const PROTECTED_PROXIES = [
	'proxy-a',
	'proxy-b',
	'proxy-c',
	'proxy-d',
	'proxy-e',
	'proxy-f'
] as const;

/** FG21/1's four groupings; each a list of driver ids from a fixed vocabulary, empty when none. */
export interface VulnerabilityDrivers {
	health: string[];
	lifeEvents: string[];
	resilience: string[];
	capability: string[];
}

export const VULNERABILITY_DRIVERS: Readonly<
	Record<keyof VulnerabilityDrivers, readonly string[]>
> = {
	health: ['long-term-condition', 'mental-health', 'sensory-impairment', 'cognitive-impairment'],
	lifeEvents: [
		'bereavement',
		'relationship-breakdown',
		'job-loss',
		'caring-responsibility',
		'new-parent'
	],
	resilience: ['low-savings', 'over-indebted', 'irregular-income', 'no-buffer'],
	capability: ['low-literacy', 'low-numeracy', 'low-digital-confidence', 'english-second-language']
};

export interface Customer {
	/** `cust-<8 hex>`, from the seed. */
	id: string;
	name: SyntheticName;
	dateOfBirthYear: number;
	address: SyntheticAddress;
	email: string;
	phone: string;
	employment: Employment;
	employer?: string;
	dependants: number;
	tenureYears: number;
	digitalConfidence: DigitalConfidence;
	cohort: CohortBlock;
	vulnerability: VulnerabilityDrivers;
	/** What the customer has actually told the bank — a subset of `vulnerability`, on the file. */
	disclosed: VulnerabilityDrivers;
	consent: {
		marketing: boolean;
		dataSharing: boolean;
		preferredChannel: 'app' | 'phone' | 'branch' | 'post';
	};
	niNumber: string;
}

export type AccountKind = 'current' | 'savings' | 'credit-card' | 'loan' | 'mortgage';

export interface AccountBaseline {
	typicalMonthlySpend: number;
	typicalTransaction: number;
	merchantCategories: string[];
	devices: string[];
	countries: string[];
	payees: string[];
}

export interface Account {
	id: string;
	customerId: string;
	kind: AccountKind;
	sortCode: string;
	accountNumber: string;
	iban?: string;
	/** On a credit card only; Luhn-failing by construction. */
	pan?: string;
	balance: number;
	creditLimit?: number;
	interestRateBps?: number;
	openedYear: number;
	status: 'open' | 'frozen' | 'closed';
	baseline: AccountBaseline;
}

export type ProductCategory = 'savings' | 'investment' | 'credit' | 'insurance';

export interface Product {
	id: string;
	name: string;
	category: ProductCategory;
	/** 1 = cash-like … 7 = speculative. */
	riskBand: 1 | 2 | 3 | 4 | 5 | 6 | 7;
	/** Annual charge, basis points. */
	priceBps: number;
	eligibility: {
		minAge: number;
		minIncomeBand?: IncomeBand;
		maxRiskBand?: number;
		needsAdvice?: boolean;
		ukResidentOnly: true;
	};
	targetMarket: string;
	factsheet: string;
	/** The mandated warnings, verbatim. */
	warnings: string[];
}

export type TransactionChannel =
	'card-present' | 'card-not-present' | 'faster-payment' | 'direct-debit' | 'atm' | 'transfer';

export interface Transaction {
	id: string;
	accountId: string;
	/** Days before the case; 0 = today. */
	day: number;
	/** `HH:MM`. */
	time: string;
	amount: number;
	direction: 'debit' | 'credit';
	merchant: string;
	merchantCategory: string;
	channel: TransactionChannel;
	device?: string;
	country: string;
	payee?: string;
	/** Transactions in the same hour on the same account, counting this one. */
	velocity: number;
}

export type ComplaintCategory =
	'service' | 'charges' | 'advice' | 'fraud-handling' | 'lending-decision' | 'data';

export interface Complaint {
	id: string;
	customerId: string;
	openedDay: number;
	category: ComplaintCategory;
	summary: string;
	status: 'open' | 'acknowledged' | 'resolved';
}

export interface BureauFile {
	customerId: string;
	scoreBand: 'poor' | 'fair' | 'good' | 'very-good' | 'excellent';
	defaults: number;
	arrearsMonths: number;
	searchesLast12m: number;
	affordability: { monthlyIncome: number; monthlyCommitments: number; disposable: number };
}

/** One customer with everything that hangs off them — what a desk asks for by seed. */
export interface BankCase {
	seed: number;
	customer: Customer;
	accounts: Account[];
	transactions: Transaction[];
	complaints: Complaint[];
	bureau: BureauFile;
	shelf: Product[];
}
