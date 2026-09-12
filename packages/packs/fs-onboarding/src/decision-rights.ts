import type { WorkflowAutonomyLevel } from '@craftabot/core';

/**
 * **The onboarding ceilings** (WP103, `83-…` §6.5.2; the pattern of
 * `fs-lending/src/decision-rights.ts`): the highest autonomy level a
 * decision kind may run at, carried as content and *measured* as a breach
 * rate, never enforced. The account opening is the agent's first
 * irreversible act (4); an adverse decision has a right to human review
 * (3); a screening match is handled with a person deciding — the machine
 * may run the screening and draft, the person decides (3), so Level 4 and
 * above, where the bot decides on a match itself, is a breach.
 */
export const ONBOARDING_CEILINGS: Readonly<Record<string, WorkflowAutonomyLevel>> = {
	'account-open': 4,
	'adverse-onboarding-decision': 3,
	'screening-hit-handling': 3
};
