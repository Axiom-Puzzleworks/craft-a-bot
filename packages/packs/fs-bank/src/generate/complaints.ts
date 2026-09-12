import type { Complaint, ComplaintCategory, Customer } from '../model.js';
import { calibrationRow } from '@craftabot/core';
import { hexId, pick, tableOf, weightedRow, type Calibrated } from './customer.js';
import { COMPLAINT_SUMMARIES } from './vocab.js';

/** Most customers have none; a few have one; the complainant persona has one to press. */
export function generateComplaints(
	random: () => number,
	customer: Customer,
	options?: Calibrated
): Complaint[] {
	const table = tableOf(options);
	const count = Number(weightedRow(random, calibrationRow(table, 'complaint-count')));
	// A category row with equal weights draws exactly as `pick` did over the vocabulary's keys, in the same order.
	const categoryRow = calibrationRow(table, 'complaint-category');
	return Array.from({ length: count }, (): Complaint => {
		const category = weightedRow<ComplaintCategory>(random, categoryRow);
		return {
			id: hexId(random, 'cmp'),
			customerId: customer.id,
			openedDay: Math.floor(random() * 40),
			category,
			summary: pick(random, COMPLAINT_SUMMARIES[category] ?? ['A complaint.']),
			status: weightedRow<Complaint['status']>(random, calibrationRow(table, 'complaint-status'))
		};
	});
}
