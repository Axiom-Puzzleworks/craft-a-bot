import type { StageHandoff } from '@craftabot/core';
import type { Customer } from './model.js';

/**
 * **Contestability: the appeal as a handoff** (WP145,
 * `110-CONTROL-SUITE-PLAN.md` §10; UK GDPR Art. 22(3), Consumer Duty). A
 * customer who contests an adverse decision — a declined loan, a refused
 * account, a declined dispute — has it reviewed by people who did not make
 * it. In UK retail banking that review is a complaint under DISP, so every
 * desk hands a contested decision to the one review journey the bank has,
 * `fs-advice/complaints`, with `kind: 'appeal'` on the handoff: the item is
 * the register's complaint shape, built from the desk's own state, and its
 * truth is the register's rule (a decision the rules made is not upheld).
 * The complaints journey's own adverse decision is not handed on: its route
 * out is the Financial Ombudsman, which its mandatory disclosure names.
 */
export const APPEAL_REVIEW_JOURNEY = 'fs-advice/complaints';

export interface AppealInput {
	/** The decided case, unique on the desk: a transaction, an application. */
	caseId: string;
	customer: Customer;
	/** The register's complaint category: `lending-decision`, `onboarding-decision`, `fraud-handling`. */
	category: string;
	/** What was decided and what the customer says, in the desk's words. */
	summary: string;
	/** Whether the register upholds a complaint of this category; the rules' own decisions are not upheld. */
	upheld?: boolean;
}

/** The handoff a contested decision makes: to the review journey, as a complaint, marked an appeal. */
export function appealHandoff(input: AppealInput): StageHandoff {
	const upheld = input.upheld ?? false;
	return {
		handoff: APPEAL_REVIEW_JOURNEY,
		kind: 'appeal',
		item: {
			id: `complaint-from-${input.caseId}`,
			kind: 'complaint',
			customerId: input.customer.id,
			arrivedAt: '1970-01-01T00:00:00.000Z',
			payload: {
				complaint: {
					id: `cmp-${input.caseId}`,
					customerId: input.customer.id,
					openedDay: 0,
					category: input.category,
					summary: input.summary,
					status: 'open'
				},
				customer: input.customer
			},
			truth: {
				records: [
					{
						id: `complaint-truth-${input.caseId}`,
						kind: 'complaint-outcome',
						title: 'What the register says',
						fields: { category: input.category, upheld }
					}
				],
				facts: { category: input.category, upheld }
			}
		}
	};
}
