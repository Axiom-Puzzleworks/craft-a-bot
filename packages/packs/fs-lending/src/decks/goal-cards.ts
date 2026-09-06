import type { GoalCardDefinition } from '@craftabot/core';
import { lendingStrings } from '../strings.js';
import { LENDING_CASE_KINDS, type LendingCaseKind } from '../world/cases.js';
import { LENDING_DESK_WORLD_ID } from '../world/desk.js';

/**
 * **The desk's goal cards** (WP63 stage B, `52-FS-LENDING.md` §4.3): one per
 * case kind, behind the Workshop door. `par` is the scripted plan's length,
 * proved by `solvability.test.ts`.
 */
export const lendingCardId = (kind: LendingCaseKind): string => `fs-lending/${kind}`;

const SUCCESS: Record<LendingCaseKind, string> = {
	'clear-approve': 'disbursed',
	'clear-decline': 'explained',
	'borderline-refer': 'explained',
	'push-for-decision': 'explained',
	'declined-asks-why': 'explained',
	appeal: 'appealed',
	'matched-pair': 'decided',
	'doctored-payslip': 'decided',
	'support-need-skip': 'decided'
};

const CONCEPTS: Record<LendingCaseKind, string[]> = {
	'clear-approve': ['multi-step-behaviour', 'irreversible-actions', 'approval'],
	'clear-decline': ['sense', 'multi-step-behaviour'],
	'borderline-refer': ['sub-goals', 'guardrails'],
	'push-for-decision': ['guardrails', 'sense'],
	'declined-asks-why': ['sense', 'guardrails'],
	appeal: ['multi-step-behaviour'],
	'matched-pair': ['guardrails', 'sense'],
	'doctored-payslip': ['tool-poisoning', 'confused-deputy', 'sense'],
	'support-need-skip': ['confused-deputy', 'guardrails']
};

/** The plan lengths of `testing/plans.ts`, stated on the card. */
const PAR: Record<LendingCaseKind, number> = {
	'clear-approve': 5,
	'clear-decline': 4,
	'borderline-refer': 4,
	'push-for-decision': 5,
	'declined-asks-why': 4,
	appeal: 3,
	'matched-pair': 3,
	'doctored-payslip': 4,
	'support-need-skip': 4
};

export const INCIDENT_CARD_ID = 'fs-lending/incident-decline';

/** The operational incident (WP72, `61-…` §4.3): the clear-decline layout under a degraded model. */
const INCIDENT_CARD: GoalCardDefinition = {
	id: INCIDENT_CARD_ID,
	title: lendingStrings.cards.incident.title,
	goalText: lendingStrings.cards.incident.goalText,
	worldId: LENDING_DESK_WORLD_ID,
	layoutId: 'clear-decline',
	successCondition: 'explained',
	hints: [...lendingStrings.cards.incident.hints],
	teachesConcepts: ['guardrails', 'sense'],
	par: 5,
	audience: 'workshop' as const
};

export const lendingGoalCards: GoalCardDefinition[] = [
	INCIDENT_CARD,
	...LENDING_CASE_KINDS.map((kind) => ({
		id: lendingCardId(kind),
		title: lendingStrings.cards[kind].title,
		goalText: lendingStrings.cards[kind].goalText,
		worldId: LENDING_DESK_WORLD_ID,
		layoutId: kind,
		successCondition: SUCCESS[kind],
		hints: [...lendingStrings.cards[kind].hints],
		teachesConcepts: CONCEPTS[kind],
		par: PAR[kind],
		audience: 'workshop' as const
	}))
];
