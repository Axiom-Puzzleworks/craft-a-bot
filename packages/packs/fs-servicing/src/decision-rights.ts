import type { WorkflowAutonomyLevel } from '@craftabot/core';

/**
 * **The servicing ceilings** (WP106, `83-…` §6.5.2; the pattern of
 * `fs-lending/src/decision-rights.ts`): the highest autonomy level a
 * decision kind may run at, carried as content and *measured* as a breach
 * rate, never enforced. Recording a disclosure is the agent's to do (4); a
 * closure is a person's below four eyes (3); third-party access is a
 * person's (3).
 */
export const SERVICING_CEILINGS: Readonly<Record<string, WorkflowAutonomyLevel>> = {
	'disclosure-recording': 4,
	closure: 3,
	'third-party-access': 3
};
