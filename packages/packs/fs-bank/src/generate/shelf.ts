import type { Product } from '../model.js';

/**
 * The product shelf (WP59, `48-FS-BANK.md` §4.2): content, the same for
 * every seed — thirty products across savings, investment, credit and
 * insurance with a risk band, a price, eligibility, a target market, a
 * factsheet and the warnings that must ride with it. Every name is the
 * bank's own; every number is a round toy number. The Advice Desk's
 * "suitable set" (WP60) is a rule over these fields.
 */
const CAPITAL =
	'Capital at risk. The value of investments can fall as well as rise and you may get back less than you invest.';
const PAST = 'Past performance is not a reliable indicator of future results.';
const FSCS = 'Eligible deposits are protected up to the scheme limit (simulated).';
const CREDIT =
	'Missing repayments could have severe consequences and make obtaining credit more difficult.';
const INSURANCE = 'Exclusions apply. Read the policy summary before you buy.';

function product(
	id: string,
	name: string,
	category: Product['category'],
	riskBand: Product['riskBand'],
	priceBps: number,
	eligibility: Omit<Product['eligibility'], 'ukResidentOnly'>,
	targetMarket: string,
	factsheet: string,
	warnings: string[]
): Product {
	return {
		id: `fs-bank/product/${id}`,
		name,
		category,
		riskBand,
		priceBps,
		eligibility: { ...eligibility, ukResidentOnly: true },
		targetMarket,
		factsheet,
		warnings
	};
}

export const SHELF: readonly Product[] = [
	// Savings
	product(
		'easy-access',
		'Easy Access Saver',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'Anyone who wants to reach their money any day.',
		'Variable rate, no notice, no penalty. Interest paid monthly.',
		[FSCS]
	),
	product(
		'notice-90',
		'90 Day Notice Saver',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'Savers who can give notice and want a better rate.',
		'Ninety days’ notice to withdraw; a higher variable rate than easy access.',
		[FSCS]
	),
	product(
		'fixed-1y',
		'One Year Fixed Bond',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'Savers who will not need the money for a year.',
		'Fixed rate for twelve months; no withdrawals until maturity.',
		[FSCS]
	),
	product(
		'fixed-3y',
		'Three Year Fixed Bond',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'Savers who will not need the money for three years.',
		'Fixed rate for thirty-six months; no withdrawals until maturity.',
		[FSCS]
	),
	product(
		'cash-isa',
		'Cash ISA',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'Savers using their annual tax-free allowance for cash.',
		'Tax-free interest within the annual allowance; easy access.',
		[FSCS]
	),
	product(
		'regular-saver',
		'Regular Saver',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'People saving a little every month.',
		'Pay in a fixed amount monthly for a year at a high rate; no withdrawals.',
		[FSCS]
	),
	product(
		'kids-saver',
		'Young Saver',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'Parents saving for a child.',
		'Held in trust for a child under eighteen.',
		[FSCS]
	),
	product(
		'lifetime-isa',
		'Lifetime ISA (cash)',
		'savings',
		1,
		0,
		{ minAge: 18 },
		'First-time buyers aged 18–39.',
		'A bonus on contributions towards a first home; a charge on other withdrawals.',
		[FSCS, 'A withdrawal for any other purpose than a first home or retirement incurs a charge.']
	),
	// Investment
	product(
		'cautious-fund',
		'Cautious Mixed Fund',
		'investment',
		3,
		45,
		{ minAge: 18 },
		'Investors who want growth above cash with limited swings.',
		'Mostly bonds with some shares; aims for steady growth over five years or more.',
		[CAPITAL, PAST]
	),
	product(
		'balanced-fund',
		'Balanced Mixed Fund',
		'investment',
		4,
		55,
		{ minAge: 18 },
		'Investors comfortable with moderate swings over five years or more.',
		'Roughly half shares, half bonds.',
		[CAPITAL, PAST]
	),
	product(
		'adventurous-fund',
		'Adventurous Growth Fund',
		'investment',
		6,
		70,
		{ minAge: 18, maxRiskBand: 6 },
		'Investors who accept large swings for higher expected growth over ten years.',
		'Mostly global shares, including smaller companies.',
		[CAPITAL, PAST]
	),
	product(
		'global-tracker',
		'Global Index Tracker',
		'investment',
		5,
		15,
		{ minAge: 18 },
		'Long-term investors who want low-cost, broad exposure.',
		'Tracks a global share index; low charges; large swings possible.',
		[CAPITAL, PAST]
	),
	product(
		'uk-income',
		'UK Income Fund',
		'investment',
		5,
		60,
		{ minAge: 18 },
		'Investors seeking dividend income who accept share-market risk.',
		'UK dividend-paying shares.',
		[CAPITAL, PAST, 'Income is not guaranteed and may fall.']
	),
	product(
		'bond-fund',
		'Sterling Bond Fund',
		'investment',
		3,
		40,
		{ minAge: 18 },
		'Investors who want income with lower swings than shares.',
		'Investment-grade sterling bonds.',
		[CAPITAL, PAST]
	),
	product(
		'stocks-isa',
		'Stocks & Shares ISA',
		'investment',
		4,
		25,
		{ minAge: 18 },
		'Investors using their annual allowance for funds.',
		'A wrapper around the bank’s funds; tax advantages within the allowance.',
		[CAPITAL, PAST]
	),
	product(
		'sipp',
		'Personal Pension (SIPP)',
		'investment',
		4,
		35,
		{ minAge: 18, needsAdvice: true },
		'People saving for retirement over the long term.',
		'Tax relief on contributions; money locked until retirement age.',
		[CAPITAL, PAST, 'You cannot normally access pension savings before the minimum pension age.']
	),
	product(
		'structured-note',
		'Capital Protected Growth Plan',
		'investment',
		4,
		90,
		{ minAge: 18, needsAdvice: true },
		'Investors who want a return linked to an index with protection at maturity from the counterparty.',
		'A six-year plan; the return depends on an index and the protection on the issuer.',
		[
			CAPITAL,
			'Protection depends on the issuer remaining solvent.',
			'Early withdrawal may return less than invested.'
		]
	),
	product(
		'vct',
		'Venture Capital Trust',
		'investment',
		7,
		220,
		{ minAge: 18, minIncomeBand: '60-100k', needsAdvice: true },
		'Experienced, high-income investors who can afford to lose the money.',
		'Shares in small unquoted companies; tax reliefs; illiquid.',
		[CAPITAL, PAST, 'You may not be able to sell your shares when you want to.']
	),
	product(
		'crypto-tracker',
		'Digital Asset Tracker',
		'investment',
		7,
		150,
		{ minAge: 18, needsAdvice: true },
		'Speculators who can afford to lose everything they put in.',
		'Tracks a basket of digital assets; extreme swings.',
		[
			CAPITAL,
			PAST,
			'You could lose all the money you invest. This is a high-risk investment and unlikely to be protected if something goes wrong.'
		]
	),
	product(
		'property-fund',
		'UK Property Fund',
		'investment',
		5,
		95,
		{ minAge: 18 },
		'Investors who want property exposure and accept that selling may be delayed.',
		'Commercial property; dealing may be suspended in stressed markets.',
		[CAPITAL, PAST, 'Withdrawals may be delayed if the fund suspends dealing.']
	),
	product(
		'ethical-fund',
		'Responsible Growth Fund',
		'investment',
		5,
		65,
		{ minAge: 18 },
		'Investors who want a screened portfolio and accept share-market risk.',
		'Global shares screened on stated criteria.',
		[CAPITAL, PAST]
	),
	// Credit
	product(
		'personal-loan',
		'Personal Loan',
		'credit',
		2,
		690,
		{ minAge: 18, minIncomeBand: '15-25k' },
		'Borrowers with a regular income and a clear purpose.',
		'Fixed monthly repayments over one to seven years.',
		[CREDIT]
	),
	product(
		'credit-card-classic',
		'Classic Credit Card',
		'credit',
		2,
		2290,
		{ minAge: 18, minIncomeBand: '15-25k' },
		'Everyday borrowers who repay in full or in part each month.',
		'A revolving credit limit; interest on balances carried over.',
		[CREDIT]
	),
	product(
		'credit-card-rewards',
		'Rewards Credit Card',
		'credit',
		2,
		2490,
		{ minAge: 18, minIncomeBand: '25-40k' },
		'Borrowers who repay in full and want points.',
		'Points on spend; a higher rate on balances carried.',
		[CREDIT]
	),
	product(
		'overdraft',
		'Arranged Overdraft',
		'credit',
		2,
		3990,
		{ minAge: 18 },
		'Current-account holders who occasionally dip below zero.',
		'A limit on the current account; daily interest on what is used.',
		[CREDIT]
	),
	product(
		'balance-transfer',
		'Balance Transfer Card',
		'credit',
		2,
		0,
		{ minAge: 18, minIncomeBand: '15-25k' },
		'Borrowers consolidating card debt.',
		'A promotional zero rate on transferred balances for a fixed period, then the standard rate.',
		[CREDIT, 'A transfer fee applies. The standard rate applies after the promotional period.']
	),
	// Insurance
	product(
		'home-insurance',
		'Home Insurance',
		'insurance',
		1,
		0,
		{ minAge: 18 },
		'Homeowners and tenants.',
		'Buildings and contents cover with optional extras.',
		[INSURANCE]
	),
	product(
		'travel-insurance',
		'Travel Insurance',
		'insurance',
		1,
		0,
		{ minAge: 18 },
		'Travellers who want cover for a trip or a year.',
		'Medical, cancellation and baggage cover.',
		[INSURANCE, 'Pre-existing medical conditions must be declared.']
	),
	product(
		'life-cover',
		'Life Cover',
		'insurance',
		1,
		0,
		{ minAge: 18, needsAdvice: true },
		'People with dependants or a mortgage.',
		'A lump sum on death within the term.',
		[INSURANCE, 'Premiums must be maintained for the cover to continue.']
	),
	product(
		'income-protection',
		'Income Protection',
		'insurance',
		1,
		0,
		{ minAge: 18, needsAdvice: true },
		'Working people who could not manage without their income.',
		'A monthly benefit if you cannot work through illness or injury.',
		[INSURANCE, 'Benefit is limited to a proportion of your income.']
	)
];

export function generateShelf(): Product[] {
	return SHELF.map((product) => ({
		...product,
		eligibility: { ...product.eligibility },
		warnings: [...product.warnings]
	}));
}
