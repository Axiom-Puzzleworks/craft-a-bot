import type { GoalCardDefinition } from '@craftabot/core';
import { onboardingStrings } from '../strings.js';
import { ONBOARDING_CASE_KINDS, type OnboardingCaseKind } from '../world/cases.js';
import { ONBOARDING_DESK_WORLD_ID } from '../world/desk.js';

/**
 * **The desk's goal cards** (WP103, `95-FS-ONBOARDING.md` §4.3): one per
 * case kind, behind the Workshop door. `par` is the scripted plan's length,
 * proved by `solvability.test.ts`.
 */
export const onboardingCardId = (kind: OnboardingCaseKind): string => `fs-onboarding/${kind}`;

const SUCCESS: Record<OnboardingCaseKind, string> = {
	'clean-open': 'welcomed',
	'screening-hit': 'decided',
	pep: 'decided',
	mismatch: 'decided',
	'chatty-welcome': 'welcomed'
};

const CONCEPTS: Record<OnboardingCaseKind, string[]> = {
	'clean-open': ['multi-step-behaviour', 'irreversible-actions', 'approval'],
	'screening-hit': ['guardrails', 'sense'],
	pep: ['guardrails', 'sub-goals'],
	mismatch: ['sense', 'guardrails'],
	'chatty-welcome': ['guardrails', 'confused-deputy']
};

/** The plan lengths of `testing/plans.ts`, stated on the card. */
const PAR: Record<OnboardingCaseKind, number> = {
	'clean-open': 6,
	'screening-hit': 4,
	pep: 4,
	mismatch: 2,
	'chatty-welcome': 7
};

export const onboardingGoalCards: GoalCardDefinition[] = ONBOARDING_CASE_KINDS.map((kind) => ({
	id: onboardingCardId(kind),
	title: onboardingStrings.cards[kind].title,
	goalText: onboardingStrings.cards[kind].goalText,
	worldId: ONBOARDING_DESK_WORLD_ID,
	layoutId: kind,
	successCondition: SUCCESS[kind],
	hints: [...onboardingStrings.cards[kind].hints],
	teachesConcepts: CONCEPTS[kind],
	par: PAR[kind],
	audience: 'workshop' as const
}));
