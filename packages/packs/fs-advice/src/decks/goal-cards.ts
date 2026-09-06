import type { GoalCardDefinition } from '@craftabot/core';
import { adviceStrings } from '../strings.js';
import { ADVICE_CASE_KINDS, type AdviceCaseKind } from '../world/cases.js';
import { ADVICE_DESK_WORLD_ID, GUIDANCE_KINDS, guidanceLayoutId } from '../world/desk.js';

/**
 * **The desk's goal cards** (WP60 stage B, `49-FS-ADVICE.md` §4.4): one
 * advice card per case kind and a guidance twin for the two plainest. The
 * card is where the advice/guidance boundary lives (§3 principle 4). All
 * behind the Workshop door (`audience: 'workshop'`), as the Front Desk's.
 * `par` is the scripted plan's length, proved by `solvability.test.ts`.
 */
export const adviseCardId = (kind: AdviceCaseKind): string => `fs-advice/advise-${kind}`;
export const guideCardId = (kind: AdviceCaseKind): string => `fs-advice/guide-${kind}`;

/** Which cards a guidance-only bot plays (the boundary `boundary-held` reads). */
export const isGuidanceCard = (goalCardId: string): boolean =>
	goalCardId.startsWith('fs-advice/guide-');

/** What a right run ends with, by kind (§4.4). */
const SUCCESS: Record<AdviceCaseKind, string> = {
	inheritance: 'recommendation-made',
	'rainy-day': 'recommendation-made',
	'first-home': 'recommendation-made',
	'nothing-suits': 'referred',
	pushy: 'recommendation-made',
	guarantee: 'recommendation-made',
	bereavement: 'referred',
	'low-literacy': 'referred',
	'support-need': 'referred',
	'sell-the-fund': 'conversation-ended',
	'cheaper-alternative': 'recommendation-made',
	'address-change': 'conversation-ended',
	injecting: 'conversation-ended',
	'poisoned-factsheet': 'recommendation-made'
};

const CONCEPTS: Record<AdviceCaseKind, string[]> = {
	inheritance: ['multi-step-behaviour', 'sense'],
	'rainy-day': ['multi-step-behaviour', 'sense'],
	'first-home': ['multi-step-behaviour', 'sense'],
	'nothing-suits': ['sub-goals', 'sense'],
	pushy: ['guardrails', 'sense'],
	guarantee: ['guardrails'],
	bereavement: ['sense', 'guardrails'],
	'low-literacy': ['sense', 'guardrails'],
	'support-need': ['sense', 'guardrails'],
	'sell-the-fund': ['guardrails'],
	'cheaper-alternative': ['multi-step-behaviour'],
	'address-change': ['identity-spoofing', 'guardrails'],
	injecting: ['indirect-injection', 'guardrails'],
	'poisoned-factsheet': ['indirect-injection', 'confused-deputy', 'guardrails']
};

/** The plan lengths of `testing/plans.ts`, stated on the card. */
const PAR: Record<AdviceCaseKind, number> = {
	inheritance: 6,
	'rainy-day': 6,
	'first-home': 6,
	'nothing-suits': 6,
	pushy: 6,
	guarantee: 6,
	bereavement: 3,
	'low-literacy': 3,
	'support-need': 3,
	'sell-the-fund': 6,
	'cheaper-alternative': 6,
	'address-change': 2,
	injecting: 6,
	'poisoned-factsheet': 6
};

export const INCIDENT_CARD_ID = 'fs-advice/incident-rainy-day';

export const adviceGoalCards: GoalCardDefinition[] = [
	// The operational incident (WP72, `61-…` §4.3): the rainy-day layout, a degraded model, a referral.
	{
		id: INCIDENT_CARD_ID,
		title: adviceStrings.cards.incident.title,
		goalText: adviceStrings.cards.incident.goalText,
		worldId: ADVICE_DESK_WORLD_ID,
		layoutId: 'rainy-day',
		successCondition: 'referred',
		hints: [...adviceStrings.cards.incident.hints],
		teachesConcepts: ['guardrails', 'sense'],
		par: 3,
		audience: 'workshop' as const
	},
	...ADVICE_CASE_KINDS.map((kind) => ({
		id: adviseCardId(kind),
		title: adviceStrings.cards.advise[kind].title,
		goalText: adviceStrings.cards.advise[kind].goalText,
		worldId: ADVICE_DESK_WORLD_ID,
		layoutId: kind,
		successCondition: SUCCESS[kind],
		hints: [...adviceStrings.cards.advise[kind].hints],
		teachesConcepts: CONCEPTS[kind],
		par: PAR[kind],
		audience: 'workshop' as const
	})),
	...GUIDANCE_KINDS.map((kind) => ({
		id: guideCardId(kind),
		title: adviceStrings.cards.guide[kind as 'inheritance' | 'rainy-day'].title,
		goalText: adviceStrings.cards.guide[kind as 'inheritance' | 'rainy-day'].goalText,
		worldId: ADVICE_DESK_WORLD_ID,
		layoutId: guidanceLayoutId(kind),
		successCondition: 'referred',
		hints: [...adviceStrings.cards.guide[kind as 'inheritance' | 'rainy-day'].hints],
		teachesConcepts: ['scoped-access', 'guardrails'],
		par: 6,
		audience: 'workshop' as const
	}))
];
