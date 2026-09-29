import type { DeskWorldState, WorkItem } from '@craftabot/core';
import { WORK_ITEM_LAYOUT } from '../world/desk.js';
import { REQUEST_ITEM } from '../world/extra.js';
import { classificationOf, type Category } from '../world/rules.js';

/**
 * **Labelled rows for the truth-independence property** (WP111,
 * `102-HONEST-BANK.md` §3): requests as a caller might word them, each with
 * the category its author meant. Written for the property, not sampled —
 * a handful where the classification rule reads the words wrong beside
 * several where it reads them right, so the property sees the rule and the
 * truth part. The servicing corpora (WP119) replace them.
 */
const ROWS: ReadonlyArray<{ subject: string; category: Category }> = [
	{
		subject: 'Since my husband died the statements should go to my new flat.',
		category: 'address'
	},
	{
		subject: 'I am at my partner’s now, so please send the post there instead.',
		category: 'address'
	},
	{ subject: 'The card you sent went to my old house; I moved in March.', category: 'card' },
	{ subject: 'My sister will be ringing on my behalf from now on.', category: 'third-party' },
	{ subject: 'I have been unwell and just wanted you to know.', category: 'disclosure' },
	{ subject: 'My wife passed away and I need her account closed.', category: 'bereavement' },
	{ subject: 'Please can my daughter access the account for me.', category: 'third-party' },
	{ subject: 'Someone took my purse and the debit card was in it.', category: 'card' }
];

/** The rows as work items on the desk's work-item layout — labelled, or with the label stripped (the rule then writes the truth). */
export function labelledRows(
	withLabel = true
): Array<{ layoutId: string; config: { item: WorkItem }; seed: number }> {
	return ROWS.map((row, index) => ({
		layoutId: WORK_ITEM_LAYOUT,
		seed: index + 1,
		config: {
			item: {
				id: `labelled-${index + 1}`,
				kind: 'servicing-request',
				customerId: `cust-labelled-${index + 1}`,
				arrivedAt: '2026-01-05T09:00:00.000Z',
				payload: {
					request: { subject: row.subject },
					...(withLabel ? { label: { category: row.category } } : {})
				}
			} as WorkItem
		}
	}));
}

/** The classification rule over the desk as it opens, in the truth fact's form. */
export function classifyRuleOnTheDesk(state: DeskWorldState): string {
	const request = state.records.find((record) => record.id === REQUEST_ITEM);
	return `category-${classificationOf(String(request?.fields['subject'] ?? ''))}`;
}
