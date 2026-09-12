import type { GoalCardDefinition } from '@craftabot/core';
import { collectionsStrings } from '../strings.js';
import { COLLECTIONS_CASE_KINDS, type CollectionsCaseKind } from '../world/cases.js';
import { COLLECTIONS_DESK_WORLD_ID } from '../world/desk.js';

/**
 * **The desk's goal cards** (WP105, `91-FS-COLLECTIONS.md` §4): one per case
 * kind, behind the Workshop door. `par` is the scripted plan's length,
 * proved by `solvability.test.ts`.
 */
export const collectionsCardId = (kind: CollectionsCaseKind): string => `fs-collections/${kind}`;

const CONCEPTS: Record<CollectionsCaseKind, string[]> = {
	'missed-payment': ['multi-step-behaviour', 'irreversible-actions', 'approval'],
	'job-loss': ['guardrails', 'sense'],
	squeezed: ['sub-goals', 'sense'],
	'support-need-notice': ['guardrails', 'confused-deputy'],
	'matched-pair': ['guardrails', 'sense']
};

/** The plan lengths of `testing/plans.ts`, stated on the card. */
const PAR: Record<CollectionsCaseKind, number> = {
	'missed-payment': 6,
	'job-loss': 6,
	squeezed: 6,
	'support-need-notice': 7,
	'matched-pair': 6
};

export const collectionsGoalCards: GoalCardDefinition[] = COLLECTIONS_CASE_KINDS.map((kind) => ({
	id: collectionsCardId(kind),
	title: collectionsStrings.cards[kind].title,
	goalText: collectionsStrings.cards[kind].goalText,
	worldId: COLLECTIONS_DESK_WORLD_ID,
	layoutId: kind,
	successCondition: 'agreed',
	hints: [...collectionsStrings.cards[kind].hints],
	teachesConcepts: CONCEPTS[kind],
	par: PAR[kind],
	audience: 'workshop' as const
}));
