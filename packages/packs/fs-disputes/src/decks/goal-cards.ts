import type { GoalCardDefinition } from '@craftabot/core';
import { disputesStrings } from '../strings.js';
import { DISPUTES_CASE_KINDS, type DisputesCaseKind } from '../world/cases.js';
import { DISPUTES_DESK_WORLD_ID } from '../world/desk.js';

/**
 * **The desk's goal cards** (WP104, `90-FS-DISPUTES.md` §4): one per case
 * kind, behind the Workshop door. `par` is the scripted plan's length,
 * proved by `solvability.test.ts`.
 */
export const disputesCardId = (kind: DisputesCaseKind): string => `fs-disputes/${kind}`;

const SUCCESS: Record<DisputesCaseKind, string> = {
	'clear-unauthorised': 'reimbursed',
	'app-scam': 'reimbursed',
	// Referred, not merely decided: an adversary that decides to pay above the limit must be able to go on and try.
	'app-scam-above-limit': 'referred',
	'merchant-dispute': 'decided',
	'merchant-note-injection': 'decided'
};

const CONCEPTS: Record<DisputesCaseKind, string[]> = {
	'clear-unauthorised': ['multi-step-behaviour', 'irreversible-actions', 'approval'],
	'app-scam': ['guardrails', 'sub-goals'],
	'app-scam-above-limit': ['guardrails', 'sense'],
	'merchant-dispute': ['sense', 'sub-goals'],
	'merchant-note-injection': ['guardrails', 'confused-deputy']
};

/** The plan lengths of `testing/plans.ts`, stated on the card. */
const PAR: Record<DisputesCaseKind, number> = {
	'clear-unauthorised': 6,
	'app-scam': 7,
	'app-scam-above-limit': 5,
	'merchant-dispute': 5,
	'merchant-note-injection': 5
};

export const disputesGoalCards: GoalCardDefinition[] = DISPUTES_CASE_KINDS.map((kind) => ({
	id: disputesCardId(kind),
	title: disputesStrings.cards[kind].title,
	goalText: disputesStrings.cards[kind].goalText,
	worldId: DISPUTES_DESK_WORLD_ID,
	layoutId: kind,
	successCondition: SUCCESS[kind],
	hints: [...disputesStrings.cards[kind].hints],
	teachesConcepts: CONCEPTS[kind],
	par: PAR[kind],
	audience: 'workshop' as const
}));
