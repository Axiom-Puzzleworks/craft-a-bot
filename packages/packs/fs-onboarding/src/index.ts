import type { PackManifest } from '@craftabot/core';
import { onboardingPolicyCards } from './cards/policy.js';
import { onboardingControlMap } from './controls/rows.js';
import { onboardingGoalCards } from './decks/goal-cards.js';
import { onboardingScenarios } from './decks/scenarios.js';
import { onboardingEvaluators } from './evaluators/index.js';
import {
	ONBOARDING_BASELINE_ID,
	ONBOARDING_BOOK_CAMPAIGN_ID,
	onboardingBaseline,
	onboardingBookCampaign,
	onboardingStacks
} from './campaign.js';
import { onboardingDesk } from './world/desk.js';
import { onboardingWorkflow } from './workflow.js';

/**
 * @craftabot/pack-fs-onboarding — **The Onboarding Desk** (WP103,
 * `95-FS-ONBOARDING.md`): the fourth desk on the synthetic bank, where an
 * account is opened — identity verified, the lists screened, the risk
 * rated — and a screening match is never told to the applicant. Content
 * and rules only: a `DeskWorldSpec` over the bank with the bank's own
 * screening lists in truth, decks, cards, evaluators, a journey with its
 * five configurations, a book, two campaigns. No runtime, no brick kind,
 * no tool, no schema, and no import from any other desk.
 */
export const FS_ONBOARDING_PACK_ID = 'fs-onboarding';

export const fsOnboardingPack: PackManifest = {
	id: FS_ONBOARDING_PACK_ID,
	name: 'The Onboarding Desk (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0' },
	worlds: [onboardingDesk],
	goalCards: onboardingGoalCards,
	scenarios: onboardingScenarios,
	campaigns: [
		{
			id: ONBOARDING_BASELINE_ID,
			title: 'The Onboarding Desk baseline',
			description:
				'The three decks under no guard, the three cards, and the cards with a local classifier — the tipping-off pair as gates.',
			campaign: () => onboardingBaseline()
		},
		{
			id: ONBOARDING_BOOK_CAMPAIGN_ID,
			title: 'The onboarding book by autonomy level',
			description:
				'The population as account applications through the onboarding journey under the five reference configurations — touches per case and the ceiling-breach rate by level.',
			campaign: () => onboardingBookCampaign()
		}
	],
	policyCards: onboardingPolicyCards,
	evaluators: onboardingEvaluators,
	controlMaps: [onboardingControlMap],
	workflows: [onboardingWorkflow],
	stacks: onboardingStacks
};

export default fsOnboardingPack;

export { onboardingStrings } from './strings.js';
export { onboardingBook, onboardingBookFor, type OnboardingBookOptions } from './book.js';
export {
	ONBOARDING_CONFIGURATION_IDS,
	ONBOARDING_CONFIGURATIONS,
	ONBOARDING_STAGES,
	ONBOARDING_WORKFLOW_ID,
	figuresOnTheDesk,
	onboardingDecisionKind,
	onboardingWorkflow,
	ruleVerdictOnTheDesk,
	type OnboardingConfigurationId
} from './workflow.js';
export { ONBOARDING_CEILINGS } from './decision-rights.js';
export { onboardingCardId, onboardingGoalCards } from './decks/goal-cards.js';
export {
	A_HIT_IS_NEVER_SAID,
	NO_OPEN_BEFORE_SCREENING,
	ONBOARDING_POLICY_CARD_IDS,
	OPEN_IS_FOUR_EYES,
	onboardingPolicyCards
} from './cards/policy.js';
export * from './evaluators/index.js';
export { ONBOARDING_CONTROL_ROWS, onboardingControlMap } from './controls/rows.js';
export {
	E as ONBOARDING_EVALUATOR_IDS,
	ONBOARDING_DECKS,
	onboardingScenarios,
	scenariosInOnboardingDeck,
	type OnboardingDeck,
	type OnboardingScenario
} from './decks/scenarios.js';
export {
	ONBOARDING_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	leaksTheHit,
	onboardingDesk,
	onboardingDeskSpec,
	onboardingLayouts,
	qualifyOnboardingId,
	type OnboardingDeskState
} from './world/desk.js';
export {
	ONBOARDING_CASE_KINDS,
	assembleOnboardingCase,
	onboardingCase,
	onboardingCaseFromItem,
	profileOf,
	type OnboardingCase,
	type OnboardingCaseKind,
	type OnboardingItemPayload
} from './world/cases.js';
export {
	APPLICATION_ITEM,
	DOCUMENT_RECORD,
	RISK_RECORD,
	SCREENING_RECORD,
	type Decision,
	type OnboardingApplication,
	type OnboardingExtra,
	type OnboardingState
} from './world/extra.js';
export {
	HIT_WORDS,
	OUTCOMES,
	REASON_CODES,
	isReasonCode,
	onboardingVerdict,
	riskRatingOf,
	screeningOf,
	verdictFromFigures,
	type Outcome,
	type ReasonCode,
	type RiskRating,
	type RuleFigures,
	type Screening,
	type Verdict
} from './world/rules.js';
export {
	ONBOARDING_BASELINE_ID,
	ONBOARDING_BOOK_CAMPAIGN_ID,
	ONBOARDING_GUARD_IDS,
	HIT_SCENARIOS,
	onboardingBaseline,
	onboardingBookCampaign,
	onboardingStacks
} from './campaign.js';
export {
	chattyApplicant,
	insistentApplicant,
	onboardingPersona,
	type OnboardingPersonaId
} from './personas.js';
