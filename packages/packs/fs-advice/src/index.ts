import type { PackManifest } from '@craftabot/core';
import { advicePolicyCards } from './cards/policy.js';
import { adviceGoalCards } from './decks/goal-cards.js';
import { adviceEvaluators } from './evaluators/index.js';
import { adviceScenarios } from './decks/scenarios.js';
import { adviceDesk } from './world/desk.js';

/**
 * @craftabot/pack-fs-advice — **The Advice Desk** (WP60, `49-FS-ADVICE.md`):
 * the first desk on the synthetic bank. Content and rules only — a
 * `DeskWorldSpec` over the bank's cases, decks of scenarios and cards,
 * policy cards on v2 leaves, evaluators over the trace and the truth, a
 * campaign. No runtime, no brick kind, no tool, no schema.
 */
export const FS_ADVICE_PACK_ID = 'fs-advice';

export const fsAdvicePack: PackManifest = {
	id: FS_ADVICE_PACK_ID,
	name: 'The Advice Desk (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0' },
	worlds: [adviceDesk],
	goalCards: adviceGoalCards,
	scenarios: adviceScenarios,
	policyCards: advicePolicyCards,
	evaluators: adviceEvaluators
};

export default fsAdvicePack;

export { adviceStrings } from './strings.js';
export {
	ADVICE_DESK_WORLD_ID,
	adviceDesk,
	adviceDeskSpec,
	adviceLayouts,
	GUIDANCE_KINDS,
	guidanceLayoutId,
	qualifyAdviceId,
	type AdviceDeskState
} from './world/desk.js';
export {
	ADVICE_CASE_KINDS,
	adviceCase,
	answerRecords,
	DISCLOSING_KINDS,
	INJECTION_PAYLOAD,
	POISONED_PAYLOAD,
	PRODUCT,
	profileOf,
	tag,
	untag,
	type AdviceCase,
	type AdviceCaseKind,
	type AdviceCaseOptions
} from './world/cases.js';
export {
	answerRecordId,
	isTopic,
	REQUIRED_TOPICS,
	TOPICS,
	type AdviceExtra,
	type AdviceState,
	type Topic
} from './world/extra.js';
export {
	ageOf,
	cheapestOf,
	eligible,
	suitableProducts,
	type AdviceAnswers,
	type Goal,
	type Knowledge,
	type SuitabilityOptions
} from './world/suitability.js';
export { advicePersona, advicePersonas } from './personas.js';
export { adviceGoalCards, adviseCardId, guideCardId, isGuidanceCard } from './decks/goal-cards.js';
export {
	ADVICE_DECKS,
	adviceScenarios,
	scenariosInDeck,
	type AdviceDeck,
	type AdviceScenario
} from './decks/scenarios.js';
export {
	ACCOUNT_NUMBER_PATTERN,
	ADVICE_POLICY_CARD_IDS,
	CRM_READ_RECORD,
	FOUR_EYES_ON_EXECUTION,
	GUARANTEE_PATTERN,
	NI_NUMBER_PATTERN,
	NO_GUARANTEES,
	NO_RECOMMENDATION_BEFORE_SUITABILITY,
	PII_STAYS_ON_THE_DESK,
	PURPOSE_LIMITED_LOOKUP,
	RISK_WARNING_RIDES_WITH_EVERY_RECOMMENDATION,
	SORT_CODE_PATTERN,
	VULNERABILITY_MEANS_REFER,
	advicePolicyCards
} from './cards/policy.js';
export * from './evaluators/index.js';
export { ADVICE_CONTROL_ROWS } from './controls/rows.js';
