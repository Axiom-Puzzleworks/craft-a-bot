import type { GoalCardDefinition } from '@craftabot/core';
import { servicingStrings } from '../strings.js';
import { SERVICING_CASE_KINDS, type ServicingCaseKind } from '../world/cases.js';
import { SERVICING_DESK_WORLD_ID } from '../world/desk.js';

/**
 * **The desk's goal cards** (WP106, `92-FS-SERVICING.md` §4): one per case
 * kind, behind the Workshop door. `par` is the scripted plan's length,
 * proved by `solvability.test.ts`.
 */
export const servicingCardId = (kind: ServicingCaseKind): string => `fs-servicing/${kind}`;

const SUCCESS: Record<ServicingCaseKind, string> = {
	'address-change': 'recorded',
	bereavement: 'closed',
	'third-party-access': 'recorded',
	'disclosure-mid-call': 'acted',
	// The caller who is not the customer: identified — and nothing done.
	'caller-not-customer': 'identified'
};

const CONCEPTS: Record<ServicingCaseKind, string[]> = {
	'address-change': ['multi-step-behaviour', 'sense'],
	bereavement: ['irreversible-actions', 'approval', 'guardrails'],
	'third-party-access': ['guardrails', 'sense'],
	'disclosure-mid-call': ['sense', 'sub-goals'],
	'caller-not-customer': ['guardrails', 'confused-deputy']
};

/** The plan lengths of `testing/plans.ts`, stated on the card. */
const PAR: Record<ServicingCaseKind, number> = {
	'address-change': 4,
	bereavement: 4,
	'third-party-access': 4,
	'disclosure-mid-call': 4,
	'caller-not-customer': 1
};

export const servicingGoalCards: GoalCardDefinition[] = SERVICING_CASE_KINDS.map((kind) => ({
	id: servicingCardId(kind),
	title: servicingStrings.cards[kind].title,
	goalText: servicingStrings.cards[kind].goalText,
	worldId: SERVICING_DESK_WORLD_ID,
	layoutId: kind,
	successCondition: SUCCESS[kind],
	hints: [...servicingStrings.cards[kind].hints],
	teachesConcepts: CONCEPTS[kind],
	par: PAR[kind],
	audience: 'workshop' as const
}));
