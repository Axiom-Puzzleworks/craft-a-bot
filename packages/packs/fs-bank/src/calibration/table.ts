import { assumption, impliedMarginal, perDrawRate, publication, row, table } from './rows.js';

/**
 * **The calibration table** (WP74 stage A, `66-CALIBRATION.md` §2 and
 * §4.1; `64-…` §6.1.2, tenet 19): every distribution the population draws
 * from, set to a published UK aggregate with the publication, edition,
 * table and retrieval date on the row, or stated as an assumption that
 * says why. The figures were read from the documents on 2026-09-10 and the
 * arithmetic from a document's numbers to a row's is in the row's `note`.
 * **Every row is `review: 'pending'`** until Andrew has read it against its
 * source (`66-…` §2); the bank page says so.
 *
 * `bankCase(seed)` does not draw from this table — the decks were designed
 * on `DECK_WEIGHTS` and stay there. `population()` (stage B) does.
 */
const ONS_MYE = publication(
	'Office for National Statistics',
	'Estimates of the population for the UK, England, Wales, Scotland and Northern Ireland',
	'mid-2023 (published 8 October 2024)',
	'mye23tablesuk.xlsx, sheet MYE2 – Persons, row UNITED KINGDOM, summed over single years of age 18 and over',
	'https://www.ons.gov.uk/peoplepopulationandcommunity/populationandmigration/populationestimates/datasets/populationestimatesforukenglandandwalesscotlandandnorthernireland'
);
const ONS_A05 = publication(
	'Office for National Statistics',
	'A05 SA: Employment, unemployment and economic inactivity by age group (seasonally adjusted)',
	'Apr–Jun 2026 (published 18 August 2026)',
	'sheet People, rates (%) by age group',
	'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/employmentunemploymentandeconomicinactivitybyagegroupseasonallyadjusteda05sa'
);
const HMRC_SPI = publication(
	'HM Revenue & Customs',
	'Personal Incomes Statistics 2022 to 2023',
	'tax year 2022 to 2023 (published 12 March 2025)',
	'Collated_Tables_3_1_to_3_17_2223.ods, Table 3.1 (before tax), row 2022 to 2023: 10th £15,500 · 25th £20,000 · 50th £28,400 · 75th £43,000 · 90th £64,800 · 95th £90,500 · 99th £201,000',
	'https://www.gov.uk/government/statistics/personal-incomes-statistics-for-the-tax-year-2022-to-2023'
);
const FLS_VULN = publication(
	'Financial Conduct Authority',
	'Financial Lives 2024 survey: Vulnerability & financial resilience — selected findings',
	'May 2024 fieldwork, published May 2025',
	'chart data workbook, Slide 23 Chart 2 (the four drivers, updated algorithm, 2024) and Slide 22 Chart 1 (one or more characteristics, 2024)',
	'https://www.fca.org.uk/publication/financial-lives/fls-2024-vulnerability-financial-resilience.pdf'
);
const FLS_CREDIT = publication(
	'Financial Conduct Authority',
	'Financial Lives 2024 survey: Credit & loans — selected findings',
	'May 2024 fieldwork, published May 2025',
	'chart data workbook, Slide 24 Chart 1 — mainstream credit held now or in the last 12 months, 2024',
	'https://www.fca.org.uk/publication/financial-lives/fls-2024-credit-loans.pdf'
);
const FLS_KEY = publication(
	'Financial Conduct Authority',
	'Financial Lives 2024 survey: key findings',
	'May 2024 fieldwork, published May 2025',
	'§2 Product holdings — residential mortgages 27% of adults; §2 Digital exclusion — 2% digitally excluded, 7% of current-account holders not banking online or by app',
	'https://www.fca.org.uk/publication/financial-lives/financial-lives-survey-2024-key-findings.pdf'
);
const UKF_PAYMENTS = publication(
	'UK Finance',
	'UK Payment Markets 2025',
	'2025 edition (summary)',
	'summary: 49.7bn payments; cards 64% of payments; Faster Payments 6.2bn; cash 8%; 91% of adults use remote banking',
	'https://www.ukfinance.org.uk/system/files/2025-10/Payment%20Markets%20Report%20Summary.pdf'
);
const UKF_FRAUD = publication(
	'UK Finance',
	'Annual Fraud Report 2025',
	'2024 data (published May 2025)',
	'card fraud cases table (total 3,095,687; remote purchase 2,586,217) and the overall authorised payment fraud table (185,733 cases, £450.7m)',
	'https://www.ukfinance.org.uk/policy-and-guidance/reports-and-publications/annual-fraud-report-2025'
);
const BOE_FSR = publication(
	'Bank of England',
	'Financial Stability Report',
	'December 2025',
	'the household section: the share of consumer-credit accounts in arrears levelled off at around 4%',
	'https://www.bankofengland.co.uk/financial-stability-report/2025/december-2025'
);
const FCA_COMPLAINTS = publication(
	'Financial Conduct Authority',
	'Aggregate complaints data: 2024 H2',
	'2024 H2 (published April 2025)',
	'product group table: 1.78m complaints in the half-year, banking and credit cards 839,526',
	'https://www.fca.org.uk/data/complaints-data/aggregate-complaints-data-2024-h2'
);

/**
 * The cited marginals per driver grouping — except capability, whose draw
 * is the *residual*: the generator also files every low-literacy and
 * low-digital-confidence customer under capability (as the survey's own
 * definition does), and with literacy low at 6% and digital low at 10%
 * those alone reach 1 − 0.94 × 0.90 = 15.4%, so the draw supplies the
 * 1.9 points to 17%: 1 − 0.846 (1 − m) = 0.17 → m ≈ 0.019.
 */
const DRIVER_MARGINALS = { health: 0.09, lifeEvents: 0.2, resilience: 0.26, capability: 0.019 };
const perDraw = Object.fromEntries(
	Object.entries(DRIVER_MARGINALS).map(([key, marginal]) => [key, perDrawRate(marginal)])
);

export const CALIBRATION = table(
	'fs-bank/calibration',
	'Where this bank’s shape comes from',
	'The distributions the population draws from, each set to a published UK aggregate and cited, or stated as an assumption that says why.',
	[
		row({
			id: 'age-band',
			kind: 'weights',
			title: 'Age band',
			distribution: {
				'18-24': 10.5,
				'25-34': 16.8,
				'35-44': 16.8,
				'45-54': 15.8,
				'55-64': 16.3,
				'65-74': 12.2,
				'75+': 11.7
			},
			source: ONS_MYE,
			tolerance: 0.01,
			note: 'Shares of the 54.20m adults aged 18 and over at mid-2023. A bank’s customers are assumed to have the adult population’s age structure.'
		}),
		row({
			id: 'employment-65-plus',
			kind: 'weights',
			title: 'Employment status, 65 and over',
			distribution: { retired: 86.7, employed: 11.5, 'self-employed': 1.8 },
			source: ONS_A05,
			tolerance: 0.02,
			note: 'Age 65+: employment rate 13.3%, inactivity 86.3%, unemployment 2.5% of an activity rate of 13.7% (0.3 points, folded into retired). The self-employed share of the employed (13.5%) is an assumption; the model has no long-term-sick status, so every inactive adult here is retired.'
		}),
		row({
			id: 'employment-18-24',
			kind: 'weights',
			title: 'Employment status, 18–24',
			distribution: { student: 30.8, employed: 59.1, unemployed: 10.1 },
			source: ONS_A05,
			tolerance: 0.02,
			note: 'Aged 18–24: employment rate 59.1%, unemployment 14.6% of an activity rate of 69.2% (10.1 points), inactivity 30.8% read as students — INAC01 SA (Apr–Jun 2026) gives students as 27% of all 16–64 inactivity and they are the bulk of it at this age, which is an assumption. Self-employment at this age is folded into employed.'
		}),
		row({
			id: 'employment-25-64',
			kind: 'weights',
			title: 'Employment status, 25–64',
			distribution: {
				employed: 69.4,
				'self-employed': 10.8,
				unemployed: 10.4,
				student: 4.6,
				carer: 2.9,
				retired: 2.0
			},
			source: ONS_A05,
			tolerance: 0.02,
			note: 'A05’s 25–34, 35–49 and 50–64 groups blended by the mid-2023 adult population (16.8 : 24.7 : 24.2): employment 80.2%, unemployment 2.75 points, inactivity 17.05%. Inactivity split by INAC01 SA (Apr–Jun 2026) reasons: students 27.0% → 4.6; looking after family/home 16.7% → carer 2.9; retired 11.6% → 2.0; long-term sick 30.4%, temporary sick 2.1%, discouraged 0.4% and other 11.8% → 7.6, folded into unemployed (the model has no long-term-sick status) for 10.4 in all. The self-employed share of the employed (13.5%) is an assumption.'
		}),
		row({
			id: 'income-band',
			kind: 'target',
			title: 'Income band — the population’s marginal',
			distribution: {
				'under-15k': 41.8,
				'15-25k': 19.8,
				'25-40k': 19.2,
				'40-60k': 10.9,
				'60-100k': 5.8,
				'over-100k': 2.6
			},
			source: HMRC_SPI,
			tolerance: 0.04,
			note: 'Two steps. (1) Taxpayers, read off Table 3.1’s percentile points by linear interpolation: the 10th percentile is £15,500, so under-15k ≈ 9%; £25,000 sits at ≈ 40% (between the 25th at £20,000 and the 50th at £28,400) for 15–25k ≈ 31%; £40,000 at ≈ 70% for 25–40k ≈ 30%; £60,000 at ≈ 87% for 40–60k ≈ 17%; £100,000 at ≈ 95% for 60–100k ≈ 9%; over-100k ≈ 4%. (2) All adults: the statistics cover 34.5m taxpayers of 54.2m adults (ONS mid-2023), and the 36% who pay no income tax are assumed to sit under £15k (below the personal allowance), so each taxpayer band is scaled by 0.64 and the lowest band gains 36 points. A check on the population’s marginal, drawn through the three conditional rows below.'
		}),
		row({
			id: 'income-not-earning',
			kind: 'weights',
			title: 'Income band — students, carers, unemployed',
			distribution: { 'under-15k': 9, '15-25k': 1 },
			source: assumption(),
			tolerance: 0.05,
			note: 'No published individual-income table by employment status gives the model’s bands; the three conditional rows are set so their mixture over the employment rows meets the income-band target (the check on that row). FLS 2024 publishes household income by employment status, the nearest public shape.'
		}),
		row({
			id: 'income-retired',
			kind: 'weights',
			title: 'Income band — retired',
			distribution: { 'under-15k': 6, '15-25k': 3, '25-40k': 1 },
			source: assumption(),
			tolerance: 0.05,
			note: 'As income-not-earning: a conditional row set so the mixture meets the income-band target.'
		}),
		row({
			id: 'income-working',
			kind: 'weights',
			title: 'Income band — employed and self-employed',
			distribution: {
				'under-15k': 24,
				'15-25k': 20,
				'25-40k': 30,
				'40-60k': 15,
				'60-100k': 8,
				'over-100k': 3
			},
			source: assumption(),
			tolerance: 0.05,
			note: 'As income-not-earning: a conditional row set so the mixture meets the income-band target. About 16% of the population is not earning (row income-not-earning, 90% under £15k) and 21% retired (60% under £15k), which leaves the working 62% to carry 24% under £15k — part-time and low self-employed earnings — for the target’s 41.8%.'
		}),
		row({
			id: 'literacy-band',
			kind: 'weights',
			title: 'Literacy band',
			distribution: { low: 6, medium: 54, high: 40 },
			source: assumption(),
			tolerance: 0.05,
			note: 'The nearest public measure is the OECD Survey of Adult Skills (PIAAC) 2023 country note for England — literacy at or below level 1 — which was not retrieved on 2026-09-10. The generator files every low-literacy customer under the low-capability vulnerability driver, which FLS puts at 17% of adults in all (vulnerability-capability-marginal), so `low` is set at 6% here so that literacy, digital confidence and the driver draw together meet that figure; the WP59 split was 20 / 50 / 30.'
		}),
		row({
			id: 'digital-confidence-65-plus',
			kind: 'weights',
			title: 'Digital confidence, 65 and over',
			distribution: { low: 26, medium: 49, high: 25 },
			source: FLS_KEY,
			tolerance: 0.05,
			note: 'FLS 2024 has 2% of adults digitally excluded and 7% of current-account holders not banking online or by app; the Lloyds Consumer Digital Index 2024 puts 23% of adults at the lowest digital capability. The model’s `low` means “not confident with digital banking”, set at 10% of adults between the two, skewed to older adults as FLS’s exclusion is (half of the digitally excluded were 75+ in 2022): 0.239 × 26 + 0.761 × 5 = 10.0. The split is an assumption. Every `low` customer is also filed under the low-capability vulnerability driver (vulnerability-capability-marginal).'
		}),
		row({
			id: 'digital-confidence-under-65',
			kind: 'weights',
			title: 'Digital confidence, under 65',
			distribution: { low: 5, medium: 40, high: 55 },
			source: FLS_KEY,
			tolerance: 0.05,
			note: 'See digital-confidence-65-plus.'
		}),
		row({
			id: 'vulnerability-drivers',
			kind: 'rates',
			title: 'Vulnerability drivers — the per-draw rate per grouping',
			distribution: perDraw,
			source: FLS_VULN,
			tolerance: 0.02,
			note: `The generator draws a first driver in a grouping at p and a second at p/4, so the share with any driver in the grouping is 1 − (1 − p)(1 − p/4); p is set so that share equals the cited marginal — health 9%, negative life event 20%, low resilience 26% (updated algorithm, 2024) — and, for capability, the residual after the literacy and digital-confidence rows (see vulnerability-capability-marginal): p = ${Object.entries(
				perDraw
			)
				.map(
					([key, value]) => `${key} ${value} → ${Math.round(impliedMarginal(value) * 1000) / 10}%`
				)
				.join(', ')}. The cited marginals are the target rows.`
		}),
		row({
			id: 'vulnerability-driver-marginals',
			kind: 'target',
			title: 'Adults with a characteristic in each driver grouping',
			distribution: { health: 0.09, lifeEvents: 0.2, resilience: 0.26 },
			source: FLS_VULN,
			tolerance: 0.02,
			note: 'Slide 23 Chart 2 (updated algorithm, 2024). Capability is checked separately with a wider tolerance (vulnerability-capability-marginal), because the generator adds low-literacy and low-digital-confidence drivers to it from their own rows.'
		}),
		row({
			id: 'vulnerability-capability-marginal',
			kind: 'target',
			title: 'Adults with a low-capability characteristic',
			distribution: { capability: 0.17 },
			source: FLS_VULN,
			tolerance: 0.03,
			note: 'Slide 23 Chart 2 gives 17%. The generator files every low-literacy (6%) and low-digital-confidence (10%) customer under capability, as the survey’s definition does, and draws the rest: 1 − 0.94 × 0.90 × (1 − 0.019) ≈ 17%.'
		}),
		row({
			id: 'vulnerability-any',
			kind: 'target',
			title: 'Adults with one or more characteristics of vulnerability',
			distribution: { any: 0.49 },
			source: FLS_VULN,
			tolerance: 0.1,
			note: 'Slide 22 Chart 1: 49% (26.4m). The groupings are drawn independently, and the survey finds 37% of vulnerable adults with two or more drivers (Slide 24), so independence over-counts “any” by several points; the tolerance allows for it and the note records it.'
		}),
		row({
			id: 'vulnerability-disclosure',
			kind: 'rates',
			title: 'A driver the customer has told the bank about',
			distribution: { disclosed: 0.5 },
			source: assumption(),
			tolerance: 0.05,
			note: 'No published share of vulnerable adults who have told their provider; FG21/1 says a firm cannot rely on disclosure. The WP59 rate stands.'
		}),
		row({
			id: 'support-needs',
			kind: 'rates',
			title: 'Support needs, given a health driver',
			distribution: { supportNeeds: 0.6 },
			source: assumption(),
			tolerance: 0.05,
			note: 'No public figure; the WP59 rate stands.'
		}),
		row({
			id: 'protected-proxy-rate',
			kind: 'rates',
			title: 'Each protected-characteristic proxy',
			distribution: { proxy: 0.3 },
			source: assumption(),
			tolerance: 0.05,
			note: 'The proxies are opaque by design (hard rule 9; 41-… §6.6) and correspond to no published characteristic; the WP59 rate stands.'
		}),
		row({
			id: 'dependants',
			kind: 'weights',
			title: 'Dependants',
			distribution: { '0': 6, '1': 3, '2': 3, '3': 1 },
			source: assumption(),
			tolerance: 0.05,
			note: 'ONS Families and households in the UK: 2023 (households by number of dependent children) is the source to read; it was not retrieved on 2026-09-10, and household figures would in any case be applied per adult. The WP59 weights stand.'
		}),
		row({
			id: 'consent',
			kind: 'rates',
			title: 'Consents given',
			distribution: { marketing: 0.4, dataSharing: 0.3 },
			source: assumption(),
			tolerance: 0.05,
			note: 'No public figure; the WP59 rates stand.'
		}),
		row({
			id: 'preferred-channel',
			kind: 'weights',
			title: 'Preferred channel',
			distribution: { app: 70, phone: 21, branch: 6, post: 3 },
			source: UKF_PAYMENTS,
			tolerance: 0.03,
			note: '91% of UK adults use at least one form of online, mobile or telephone banking (2025); FLS 2024 has 7% of current-account holders not banking online or by app. Remote is split app 70 : phone 21 and the remaining 9 branch 6 : post 3 by assumption.'
		}),
		row({
			id: 'savings-holding',
			kind: 'rates',
			title: 'Holds a savings account',
			distribution: { savings: 0.7 },
			source: assumption(),
			tolerance: 0.03,
			note: 'FLS 2024 Annex A (Product holdings workbook) carries the share of adults with a savings account and was not retrieved on 2026-09-10; the WP59 rate stands until it is.'
		}),
		row({
			id: 'product-holding',
			kind: 'rates',
			title: 'Holds a credit card, a personal loan, a residential mortgage',
			distribution: { 'credit-card': 0.65, loan: 0.14, mortgage: 0.27 },
			source: FLS_CREDIT,
			tolerance: 0.03,
			note: 'Credit card 65% and personal loan 14% of adults, held now or in the last 12 months (Credit & loans, Slide 24 Chart 1, 2024); residential mortgage 27% of adults (key findings §2). The mortgage draw is skipped for students, as the generator has always done.'
		}),
		row({
			id: 'savings-rate-bps',
			kind: 'weights',
			title: 'Savings rate, basis points',
			distribution: { '150': 2, '300': 4, '425': 3 },
			source: assumption(),
			tolerance: 0.05,
			note: 'Bank of England Bankstats Table G1.4 (quoted household interest rates) is the source to type from; it was not retrieved on 2026-09-10. The WP59 weights stand.'
		}),
		row({
			id: 'credit-limit',
			kind: 'weights',
			title: 'Credit-card limit',
			distribution: { '1000': 3, '2500': 4, '5000': 2, '10000': 1 },
			source: assumption(),
			tolerance: 0.05,
			note: 'No public distribution of credit limits; the WP59 weights stand.'
		}),
		row({
			id: 'transaction-departure',
			kind: 'rates',
			title: 'A transaction that departs from the baseline',
			distribution: { departure: 0.12 },
			source: assumption(),
			tolerance: 0.03,
			note: 'Unusual-but-legitimate activity, not fraud (fraud incidence is WP75’s planted label, cited from UK Finance); the WP59 rate stands.'
		}),
		row({
			id: 'channel-mix-card',
			kind: 'weights',
			title: 'Channel, on a credit card',
			distribution: { 'card-present': 6, 'card-not-present': 4 },
			source: assumption(),
			tolerance: 0.05,
			note: 'The UK Payment Markets summary gives no face-to-face / remote split within card payments; the WP59 weights stand.'
		}),
		row({
			id: 'channel-mix-current',
			kind: 'weights',
			title: 'Channel, on a current or savings account',
			distribution: { 'card-present': 59, 'card-not-present': 25, 'faster-payment': 16 },
			source: UKF_PAYMENTS,
			tolerance: 0.05,
			note: 'Cards 64% of 49.7bn payments and Faster Payments 6.2bn (12.5%), rescaled over the three channels the generator draws for these accounts (direct debits and ATM withdrawals come from the merchant category, not this row): cards 84 : Faster Payments 16, with cards split present 70 : not-present 30 by assumption.'
		}),
		row({
			id: 'transaction-credit-share',
			kind: 'rates',
			title: 'A transaction that is a credit',
			distribution: { credit: 0.08 },
			source: assumption(),
			tolerance: 0.03,
			note: 'No public figure at this grain; the WP59 rate stands.'
		}),
		row({
			id: 'bureau-stray-default',
			kind: 'rates',
			title: 'A default with no strain behind it',
			distribution: { default: 0.05 },
			source: assumption(),
			tolerance: 0.03,
			note: 'The Bank of England’s Financial Stability Report (December 2025) puts consumer-credit accounts in arrears at around 4%; a bureau default is a stronger event than arrears, and the WP59 rate stands until WP75’s hazard is calibrated against the arrears range (66-… §2, arrears-base-rate).'
		}),
		row({
			id: 'bureau-strained-defaults',
			kind: 'weights',
			title: 'Defaults, when over-indebted or strained',
			distribution: { '0': 2, '1': 3, '2': 1 },
			source: assumption(),
			tolerance: 0.05,
			note: 'No public figure conditional on strain; the WP59 weights stand.'
		}),
		row({
			id: 'complaint-count',
			kind: 'weights',
			title: 'Complaints on file',
			distribution: { '0': 7, '1': 2, '2': 1 },
			source: FCA_COMPLAINTS,
			tolerance: 0.05,
			note: '1.78m complaints in 2024 H2 across all firms ≈ 3.3% of adults in a half-year, an upper bound for one bank. The population keeps the WP59 weights (30% with a complaint) as a deliberate oversample so the complaints desk has a register; the cited rate is here so the oversampling factor (≈ 9×) is on the record.'
		}),
		row({
			id: 'complaint-category',
			kind: 'weights',
			title: 'Complaint category',
			distribution: {
				service: 1,
				charges: 1,
				advice: 1,
				'fraud-handling': 1,
				'lending-decision': 1,
				data: 1
			},
			source: assumption(),
			tolerance: 0.05,
			note: 'The FCA’s 2024 H2 data breaks banking complaints down by product (current accounts 491,172 · credit cards 217,160 · savings 80,592 · other 21,404 · packaged accounts 15,959 · overdrafts 13,290) and by cause; the model’s categories are causes, and the cause table was not read on 2026-09-10. Flat until it is.'
		}),
		// --- the books (WP75, `67-PERFORMANCE-AND-BOOKS.md` §4–§5)
		row({
			id: 'application-incidence',
			kind: 'rates',
			title: 'A customer applies for a loan in the period',
			distribution: { applies: 0.08 },
			source: assumption(),
			tolerance: 0.02,
			note: 'FLS 2024 (Credit & loans, Slide 24) has 14% of adults holding a personal loan now or in the last twelve months; a share of that is new in any half-year, and the population’s period is 180 days. 8% is an assumption that gives a 20,000-customer population a book of about 1,600 applications.'
		}),
		row({
			id: 'loan-amount',
			kind: 'weights',
			title: 'Loan amount asked for',
			distribution: {
				'1000': 10,
				'2500': 18,
				'5000': 24,
				'7500': 14,
				'10000': 16,
				'15000': 10,
				'20000': 5,
				'25000': 3
			},
			source: assumption(),
			tolerance: 0.05,
			note: 'No public distribution of unsecured loan sizes; the FLS 2024 amount-owed bands are the nearest public shape (66-… §2, loan-size-term). The Lending Desk’s decks sized a loan to a target ratio; a book asks for a sum first and lets the rule judge it.'
		}),
		row({
			id: 'loan-term',
			kind: 'weights',
			title: 'Loan term, months',
			distribution: { '12': 12, '24': 28, '36': 30, '48': 18, '60': 12 },
			source: assumption(),
			tolerance: 0.05,
			note: 'The product’s terms (12–60 months); no public distribution.'
		}),
		row({
			id: 'loan-purpose',
			kind: 'weights',
			title: 'Loan purpose',
			distribution: {
				'a car': 30,
				'home improvements': 25,
				'debt consolidation': 20,
				'a holiday': 10,
				'a wedding': 5,
				'something else': 10
			},
			source: assumption(),
			tolerance: 0.05,
			note: 'No public breakdown at this grain; the desks’ own purposes, weighted by assumption.'
		}),
		row({
			id: 'declared-income-noise',
			kind: 'rates',
			title: 'Customers round up: the declared income above the verified one',
			distribution: { roundsUp: 0.3, by: 0.15 },
			source: assumption(),
			tolerance: 0.05,
			note: 'The share of applicants who declare an income above the bureau’s verified figure, and by how much — an assumption with no public source, so a desk has something to verify.'
		}),
		row({
			id: 'loan-outcome-mix',
			kind: 'target',
			title: 'The rule’s verdicts over the book',
			distribution: { approve: 0.49, refer: 0.36, decline: 0.15 },
			source: assumption(),
			tolerance: 0.08,
			note: 'Set from the book’s first run under the default lending policy (2026-09-10: 781 approved, 573 referred, 243 declined of 1,597), so a drift in the generators or the rule moves a test. FLS 2024 (Financial inclusion §3.2): 8% of adults were declined a product in two years and 3.2m a regulated credit agreement, which bounds the decline share only loosely; the refer share has no public figure.'
		}),
		row({
			id: 'arrears-base-rate',
			kind: 'target',
			title: 'Booked loans that default within twelve months',
			distribution: { default: 0.04 },
			source: BOE_FSR,
			tolerance: 0.02,
			note: 'The FSR’s ≈ 4% of consumer-credit accounts in arrears speaks of loans that were booked. The performance label’s base rate over the *approved* book must sit within ±2 points of it (67-… §3); declines, drawn from the same hazard, default far more often, which is the counterfactual the label exists for. Checked by the lending book test (fs-lending/src/book.test.ts), since the bank cannot judge an application without the desk’s rule.'
		}),
		row({
			id: 'fraud-incidence',
			kind: 'rates',
			title: 'A transaction that is planted fraud, or a mule-in credit',
			distribution: { fraudulent: 0.0075, muleIn: 0.0025 },
			source: UKF_FRAUD,
			tolerance: 0.005,
			note: '3.10m unauthorised card fraud cases in 2024 against ≈ 31.8bn card payments (UK Payment Markets 2025: 64% of 49.7bn) is about one case per 10,000 payments; APP scams (185,733 cases) about a fifth as many. Raised by an oversampling factor of 100 (FRAUD_OVERSAMPLE, carried on every alert book’s source) so a book has enough positives to evaluate a desk on: 1% of transactions in all, three quarters card-shaped and a quarter APP-shaped.'
		}),
		row({
			id: 'complaint-status',
			kind: 'weights',
			title: 'Complaint status',
			distribution: { open: 5, acknowledged: 3, resolved: 2 },
			source: assumption(),
			tolerance: 0.05,
			note: 'No public figure; the WP59 weights stand.'
		})
	]
);
