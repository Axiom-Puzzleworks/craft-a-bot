import type { GoalCardDefinition } from '@craftabot/core';
import { fraudStrings } from '../strings.js';
import { FRAUD_CASE_KINDS, type FraudCaseKind } from '../world/cases.js';
import { FRAUD_DESK_WORLD_ID } from '../world/desk.js';

/**
 * **The desk's goal cards** (WP62 stage B, `51-FS-FRAUD.md` §4.3): one per
 * case kind, behind the Workshop door. `par` is the scripted plan's length,
 * proved by `solvability.test.ts`; the Friday-afternoon card is won in
 * twelve turns on the bench and given eight in the campaign, which is the
 * point of it.
 */
export const fraudCardId = (kind: FraudCaseKind): string => `fs-fraud/${kind}`;

const SUCCESS: Record<FraudCaseKind, string> = {
	'queue-mixed': 'queue-cleared',
	'account-takeover': 'queue-cleared',
	'app-scam': 'queue-cleared',
	'mule-in': 'queue-cleared',
	'genuine-travel': 'queue-cleared',
	'call-distressed': 'caller-verified',
	'call-social-engineer': 'conversation-ended',
	'call-coached': 'warned',
	'crm-note-injection': 'queue-cleared',
	'kyc-poisoned': 'queue-cleared',
	'friday-afternoon': 'all-fraud-actioned'
};

const CONCEPTS: Record<FraudCaseKind, string[]> = {
	'queue-mixed': ['multi-step-behaviour', 'sense', 'irreversible-actions'],
	'account-takeover': ['sense', 'multi-step-behaviour'],
	'app-scam': ['sense', 'guardrails'],
	'mule-in': ['sub-goals', 'irreversible-actions'],
	'genuine-travel': ['sense'],
	'call-distressed': ['identity-spoofing', 'sense'],
	'call-social-engineer': ['identity-spoofing', 'guardrails'],
	'call-coached': ['guardrails', 'sense'],
	'crm-note-injection': ['indirect-injection', 'guardrails'],
	'kyc-poisoned': ['confused-deputy', 'tool-poisoning', 'guardrails'],
	'friday-afternoon': ['budgets', 'sub-goals']
};

/** The plan lengths of `testing/plans.ts`, stated on the card. */
const PAR: Record<FraudCaseKind, number> = {
	'queue-mixed': 7,
	'account-takeover': 4,
	'app-scam': 3,
	'mule-in': 3,
	'genuine-travel': 3,
	'call-distressed': 2,
	'call-social-engineer': 1,
	'call-coached': 1,
	'crm-note-injection': 3,
	'kyc-poisoned': 3,
	'friday-afternoon': 12
};

export const fraudGoalCards: GoalCardDefinition[] = FRAUD_CASE_KINDS.map((kind) => ({
	id: fraudCardId(kind),
	title: fraudStrings.cards[kind].title,
	goalText: fraudStrings.cards[kind].goalText,
	worldId: FRAUD_DESK_WORLD_ID,
	layoutId: kind,
	successCondition: SUCCESS[kind],
	hints: [...fraudStrings.cards[kind].hints],
	teachesConcepts: CONCEPTS[kind],
	par: PAR[kind],
	audience: 'workshop' as const
}));
