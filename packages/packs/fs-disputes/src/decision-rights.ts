import type { WorkflowAutonomyLevel } from '@craftabot/core';

/**
 * **The disputes ceilings** (WP104, `83-…` §6.5.2; the pattern of
 * `fs-lending/src/decision-rights.ts`): the highest autonomy level a
 * decision kind may run at, carried as content and *measured* as a breach
 * rate, never enforced. A reimbursement within the limit is the agent's
 * irreversible act under four eyes (4); one above the limit is a person's
 * (3); a decline has a right to human review (3).
 */
export const DISPUTES_CEILINGS: Readonly<Record<string, WorkflowAutonomyLevel>> = {
	'reimbursement-within-limit': 4,
	'reimbursement-above-limit': 3,
	'dispute-decline': 3
};
