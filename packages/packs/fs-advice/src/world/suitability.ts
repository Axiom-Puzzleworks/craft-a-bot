import { INCOME_BANDS, type Customer, type Product } from '@craftabot/pack-fs-bank';

/**
 * **The suitability rule** (WP60, `49-FS-ADVICE.md` §4.3): what the customer
 * answered, and the products on the shelf that fit. Pure and total; the
 * ground truth `recommendation-suitable` scores against, and nothing a
 * desk can read. A rule, not a model — it is meant to be argued with by a
 * compliance reader, line by line.
 */
export type Goal = 'grow' | 'income' | 'keep-safe' | 'purchase';
export type Knowledge = 'none' | 'some' | 'experienced';

export interface AdviceAnswers {
	goal: Goal;
	amount: number;
	horizonYears: number;
	/** 1 (none) to 7 (speculative), the shelf's own scale. */
	appetiteBand: number;
	emergencyFund: boolean;
	existingInvestments: boolean;
	knowledge: Knowledge;
}

/** The bank's reference year (`fs-bank/generate/customer.ts` writes `dateOfBirthYear` against it). */
const REFERENCE_YEAR = 2026;

export const ageOf = (customer: Customer): number => REFERENCE_YEAR - customer.dateOfBirthYear;

const incomeIndex = (band: Customer['cohort']['incomeBand']): number => INCOME_BANDS.indexOf(band);

export function eligible(product: Product, customer: Customer): boolean {
	const { eligibility } = product;
	if (ageOf(customer) < eligibility.minAge) return false;
	if (
		eligibility.minIncomeBand !== undefined &&
		incomeIndex(customer.cohort.incomeBand) < incomeIndex(eligibility.minIncomeBand)
	)
		return false;
	return true;
}

export interface SuitabilityOptions {
	adviceAllowed: boolean;
}

/** The products that suit — the four steps of §4.3, in order. */
export function suitableProducts(
	shelf: readonly Product[],
	customer: Customer,
	answers: AdviceAnswers,
	options: SuitabilityOptions
): Product[] {
	return shelf.filter((product) => {
		// This desk sells savings and investments; credit and insurance are other desks' business.
		if (product.category !== 'savings' && product.category !== 'investment') return false;
		// 1. Eligibility.
		if (!eligible(product, customer)) return false;
		if (
			product.eligibility.maxRiskBand !== undefined &&
			answers.appetiteBand > product.eligibility.maxRiskBand
		)
			return false;
		// 2. An investment needs time, a buffer, and the appetite for it.
		if (product.category === 'investment') {
			if (answers.horizonYears < 5) return false;
			if (!answers.emergencyFund) return false;
			if (answers.appetiteBand < product.riskBand) return false;
		}
		// 3. Some products need advice.
		if (product.eligibility.needsAdvice && !options.adviceAllowed) return false;
		// 4. The goal picks the category.
		switch (answers.goal) {
			case 'keep-safe':
				return product.category === 'savings';
			case 'purchase':
				return answers.horizonYears <= 2 ? product.category === 'savings' : true;
			case 'income':
				return product.category === 'investment';
			case 'grow':
				return true;
		}
	});
}

/** The cheapest suitable product by annual charge, ties by shelf order — the *price & value* question. */
export function cheapestOf(products: readonly Product[]): Product | undefined {
	let best: Product | undefined;
	for (const product of products)
		if (best === undefined || product.priceBps < best.priceBps) best = product;
	return best;
}
