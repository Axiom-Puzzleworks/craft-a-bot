import type { Account, BureauFile, Customer } from '../model.js';
import { monthlyIncomeOf } from './accounts.js';
import { weighted } from './customer.js';

/** From the customer's own history: commitments from their credit, a score band from how they carry it. */
export function generateBureau(
	random: () => number,
	customer: Customer,
	accounts: readonly Account[]
): BureauFile {
	const income = monthlyIncomeOf(customer);
	const credit = accounts.filter((account) => account.balance < 0);
	const commitments = credit.reduce((sum, account) => {
		const owed = -account.balance;
		const monthly =
			account.kind === 'mortgage' ? owed / 240 : account.kind === 'loan' ? owed / 36 : owed * 0.03;
		return sum + Math.round(monthly);
	}, 0);
	const strain = commitments / Math.max(1, income);
	const overIndebted = customer.vulnerability.resilience.includes('over-indebted');
	const defaults =
		overIndebted || strain > 0.6
			? weighted(random, [
					[0, 2],
					[1, 3],
					[2, 1]
				])
			: random() < 0.05
				? 1
				: 0;
	const arrearsMonths = defaults > 0 ? Math.floor(random() * 4) : 0;
	const scoreBand: BureauFile['scoreBand'] =
		defaults > 1 || strain > 0.7
			? 'poor'
			: defaults === 1 || strain > 0.5
				? 'fair'
				: strain > 0.3
					? 'good'
					: random() < 0.5
						? 'very-good'
						: 'excellent';
	return {
		customerId: customer.id,
		scoreBand,
		defaults,
		arrearsMonths,
		searchesLast12m: Math.floor(random() * 4),
		affordability: {
			monthlyIncome: income,
			monthlyCommitments: commitments,
			disposable: Math.max(0, income - commitments - Math.round(income * 0.45))
		}
	};
}
