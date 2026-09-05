import type { Complaint, ComplaintCategory, Customer } from '../model.js';
import { hexId, pick, weighted } from './customer.js';
import { COMPLAINT_SUMMARIES } from './vocab.js';

/** Most customers have none; a few have one; the complainant persona has one to press. */
export function generateComplaints(random: () => number, customer: Customer): Complaint[] {
	const count = weighted(random, [
		[0, 7],
		[1, 2],
		[2, 1]
	]);
	const categories = Object.keys(COMPLAINT_SUMMARIES) as ComplaintCategory[];
	return Array.from({ length: count }, (): Complaint => {
		const category = pick(random, categories);
		return {
			id: hexId(random, 'cmp'),
			customerId: customer.id,
			openedDay: Math.floor(random() * 40),
			category,
			summary: pick(random, COMPLAINT_SUMMARIES[category] ?? ['A complaint.']),
			status: weighted(random, [
				['open', 5],
				['acknowledged', 3],
				['resolved', 2]
			])
		};
	});
}
