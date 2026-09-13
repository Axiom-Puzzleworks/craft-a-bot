import type { WorkflowAutonomyLevel } from '@craftabot/core';

/**
 * **The collections ceilings** (WP105, `83-…` §6.5.2; the pattern of
 * `fs-lending/src/decision-rights.ts`): the highest autonomy level a
 * decision kind may run at, carried as content and *measured* as a breach
 * rate, never enforced. Forbearance — reduced payments or breathing space —
 * is offered by a person or on a person's say (3); a default notice is a
 * person's, the machine at most drafting (2); a plan's agreement is the
 * agent's irreversible act under four eyes (4).
 */
export const COLLECTIONS_CEILINGS: Readonly<Record<string, WorkflowAutonomyLevel>> = {
	forbearance: 3,
	'default-notice': 2,
	'plan-agreement': 4
};
