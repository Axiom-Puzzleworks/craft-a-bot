import type { PackManifest } from '@craftabot/core';
import { collectionsPolicyCards } from './cards/policy.js';
import { collectionsControlMap } from './controls/rows.js';
import { collectionsGoalCards } from './decks/goal-cards.js';
import { collectionsScenarios } from './decks/scenarios.js';
import { collectionsEvaluators } from './evaluators/index.js';
import {
	COLLECTIONS_BASELINE_ID,
	COLLECTIONS_BOOK_CAMPAIGN_ID,
	collectionsBaseline,
	collectionsBookCampaign,
	collectionsStacks
} from './campaign.js';
import { collectionsDesk } from './world/desk.js';
import { collectionsWorkflow } from './workflow.js';

/**
 * @craftabot/pack-fs-collections — **The Collections Desk** (WP105,
 * `91-FS-COLLECTIONS.md`): the sixth desk on the synthetic bank, where a
 * missed payment becomes a plan — the circumstances heard first, a disclosed
 * support need recorded as said and met with forbearance, the plan the
 * rule gives agreed under four eyes, a default notice never before the
 * circumstances, a disclosure handed on to the servicing desk. Content and
 * rules only: no runtime, no brick kind, no tool, no schema, and no import
 * from any other desk.
 */
export const FS_COLLECTIONS_PACK_ID = 'fs-collections';

export const fsCollectionsPack: PackManifest = {
	id: FS_COLLECTIONS_PACK_ID,
	name: 'The Collections Desk (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0' },
	worlds: [collectionsDesk],
	goalCards: collectionsGoalCards,
	scenarios: collectionsScenarios,
	campaigns: [
		{
			id: COLLECTIONS_BASELINE_ID,
			title: 'The Collections Desk baseline',
			description:
				'The three decks under no guard, the four cards, and the cards with a local classifier — the circumstances, the notice and the matched pair as gates.',
			campaign: () => collectionsBaseline()
		},
		{
			id: COLLECTIONS_BOOK_CAMPAIGN_ID,
			title: 'The arrears book by autonomy level',
			description:
				'The population’s loans in arrears through the arrears journey under the five reference configurations — touches per case and the ceiling-breach rate by level.',
			campaign: () => collectionsBookCampaign()
		}
	],
	policyCards: collectionsPolicyCards,
	evaluators: collectionsEvaluators,
	controlMaps: [collectionsControlMap],
	workflows: [collectionsWorkflow],
	stacks: collectionsStacks
};

export default fsCollectionsPack;

export { collectionsStrings } from './strings.js';
export {
	arrearsFor,
	collectionsBook,
	collectionsBookFor,
	type CollectionsBookOptions
} from './book.js';
export {
	COLLECTIONS_CONFIGURATION_IDS,
	COLLECTIONS_CONFIGURATIONS,
	COLLECTIONS_STAGES,
	COLLECTIONS_WORKFLOW_ID,
	SERVICING_WORKFLOW_ID,
	collectionsDecisionKind,
	collectionsWorkflow,
	figuresOnTheDesk,
	ruleVerdictOnTheDesk,
	type CollectionsConfigurationId
} from './workflow.js';
export { COLLECTIONS_CEILINGS } from './decision-rights.js';
export { collectionsCardId, collectionsGoalCards } from './decks/goal-cards.js';
export {
	A_PLAN_IS_FOUR_EYES,
	CIRCUMSTANCES_BEFORE_THE_PLAN,
	COLLECTIONS_POLICY_CARD_IDS,
	FORBEARANCE_WHERE_THE_RULE_OFFERS_IT,
	NO_DEFAULT_NOTICE_BEFORE_CIRCUMSTANCES,
	collectionsPolicyCards
} from './cards/policy.js';
export * from './evaluators/index.js';
export { COLLECTIONS_CONTROL_ROWS, collectionsControlMap } from './controls/rows.js';
export {
	COLLECTIONS_DECKS,
	E as COLLECTIONS_EVALUATOR_IDS,
	MATCHED_PAIR_SCENARIO,
	collectionsScenarios,
	scenariosInCollectionsDeck,
	type CollectionsDeck,
	type CollectionsScenario
} from './decks/scenarios.js';
export {
	COLLECTIONS_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	collectionsDesk,
	collectionsDeskSpec,
	collectionsLayouts,
	monthlyFor,
	qualifyCollectionsId,
	type CollectionsDeskState
} from './world/desk.js';
export {
	COLLECTIONS_CASE_KINDS,
	assembleCollectionsCase,
	collectionsCase,
	collectionsCaseFromItem,
	profileOf,
	repaymentFor,
	type ArrearsItemPayload,
	type CollectionsCase,
	type CollectionsCaseKind,
	type PairSide
} from './world/cases.js';
export {
	AFFORDABILITY_RECORD,
	ARREARS_ITEM,
	CUSTOMER_RECORD,
	LOAN_RECORD,
	type ArrearsCase,
	type Circumstances,
	type CollectionsExtra,
	type CollectionsState,
	type Offer
} from './world/extra.js';
export {
	BREATHING_SPACE_DAYS,
	DISCLOSURES,
	PLANS,
	PLAN_MONTHS,
	REASON_CODES,
	disclosureIn,
	isReasonCode,
	verdictFromFigures,
	type Disclosure,
	type Outcome,
	type Plan,
	type ReasonCode,
	type RuleFigures,
	type Verdict
} from './world/rules.js';
export {
	COLLECTIONS_BASELINE_ID,
	COLLECTIONS_BOOK_CAMPAIGN_ID,
	COLLECTIONS_GUARD_IDS,
	collectionsBaseline,
	collectionsBookCampaign,
	collectionsStacks
} from './campaign.js';
export {
	collectionsPersona,
	jobLossCustomer,
	rainyDayCustomer,
	supportNeedCaller,
	type CollectionsPersonaId
} from './personas.js';
