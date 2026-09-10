import type { WorkflowAutonomyLevel } from '@craftabot/core';

/**
 * **The decision-rights ceilings** (WP80, `64-TARGET-DESIGN-V5.md` §6.2.3,
 * §6.4.1a; tenet 26): the thought experiment's table — the highest
 * autonomy level a decision kind may run at, keyed to legal significance,
 * customer harm and reversibility — carried here as content citing the page
 * it came from, and *measured* as a breach rate, never enforced. The point
 * of running `bot-everywhere` is to see what a Level 5 decline costs, not to
 * be prevented from running it.
 *
 * Source: axiomverity.com, *Can a Small Team Govern an AI Bank?*
 * (`/thought-experiment`, the decision-rights table), from the site's own
 * `src/lib/thought-experiment.ts` (`decisionRights[].autonomyCeiling`,
 * `autonomySpectrum`), read 2026-09-11. Synthetic ratings restated, not
 * regulatory advice; the `why` is the page's own sentence, quoted.
 */
export interface DecisionRight {
	/** The page's slug, so the two vocabularies stay one. */
	kind: string;
	decision: string;
	ceiling: WorkflowAutonomyLevel;
	legalSignificance: 'Low' | 'Moderate' | 'High';
	harmPotential: 'Low' | 'Moderate' | 'High';
	reversibility: 'Low' | 'Moderate' | 'High';
	why: string;
	/** Which of the desks' actions the kind maps to, when one does. */
	action?: string;
}

export const DECISION_RIGHTS_SOURCE = {
	publisher: 'Axiom Puzzleworks (axiomverity.com)',
	title: 'Can a Small Team Govern an AI Bank? — the decision-rights table',
	edition: '/thought-experiment, src/lib/thought-experiment.ts as read',
	retrieved: '2026-09-11'
} as const;

export const DECISION_RIGHTS: readonly DecisionRight[] = [
	{
		kind: 'in-policy-credit-approval',
		decision: 'Credit approval strictly within pre-set policy limits',
		ceiling: 4,
		legalSignificance: 'High',
		harmPotential: 'High',
		reversibility: 'Moderate',
		why: 'The Consumer Credit Act and affordability rules apply; a human designed and can override the policy boundary, but doesn’t review each individual approval.',
		action: 'decide'
	},
	{
		kind: 'adverse-credit-decision',
		decision: 'Declining a credit application, or any other adverse automated decision',
		ceiling: 3,
		legalSignificance: 'High',
		harmPotential: 'High',
		reversibility: 'Low',
		why: 'UK GDPR Article 22 gives a right to meaningful human review of solely-automated decisions with legal or similarly significant effects.',
		action: 'decide'
	},
	{
		kind: 'vulnerable-customer-support',
		decision: 'Vulnerable-customer identification and support pathway',
		ceiling: 3,
		legalSignificance: 'High',
		harmPotential: 'High',
		reversibility: 'Moderate',
		why: 'Consumer Duty specifically targets outcomes for vulnerable customers. AI can flag signals, but a human designs and owns the support approach.'
	},
	{
		kind: 'sar-filing',
		decision: 'Suspicious Activity Report filing and transaction “consent” decisions',
		ceiling: 2,
		legalSignificance: 'High',
		harmPotential: 'High',
		reversibility: 'Low',
		why: 'The page’s table caps SAR filing at Level 2: a person files, the machine drafts.'
	}
];

/** The ceilings as a workflow configuration carries them: decision kind → the highest level it may run at. */
export const LENDING_CEILINGS: Readonly<Record<string, WorkflowAutonomyLevel>> = Object.fromEntries(
	DECISION_RIGHTS.map((right) => [right.kind, right.ceiling])
);

/** The autonomy spectrum's five labels, the page's words (`64-…` §1.3). */
export const AUTONOMY_LABELS: Readonly<Record<WorkflowAutonomyLevel, string>> = {
	1: 'Human as Operator',
	2: 'Human as Collaborator',
	3: 'Human as Consultant',
	4: 'Human as Approver',
	5: 'Human as Observer'
};
