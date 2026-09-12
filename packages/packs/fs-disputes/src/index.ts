import type { PackManifest } from '@craftabot/core';
import { disputesPolicyCards } from './cards/policy.js';
import { disputesControlMap } from './controls/rows.js';
import { disputesGoalCards } from './decks/goal-cards.js';
import { disputesScenarios } from './decks/scenarios.js';
import { disputesEvaluators } from './evaluators/index.js';
import {
	DISPUTES_BASELINE_ID,
	DISPUTES_BOOK_CAMPAIGN_ID,
	disputesBaseline,
	disputesBookCampaign,
	disputesStacks
} from './campaign.js';
import { disputesDesk } from './world/desk.js';
import { disputesWorkflow } from './workflow.js';

/**
 * @craftabot/pack-fs-disputes — **The Disputes Desk** (WP104,
 * `90-FS-DISPUTES.md`): the fifth desk on the synthetic bank, where a
 * disputed payment is classified, held, investigated and decided on a
 * PSR-shaped rule with a limit as a knob — reimbursed under four eyes, a
 * scam handed to the fraud desk, a decline to the complaints desk. Content
 * and rules only: no runtime, no brick kind, no tool, no schema, and no
 * import from any other desk.
 */
export const FS_DISPUTES_PACK_ID = 'fs-disputes';

export const fsDisputesPack: PackManifest = {
	id: FS_DISPUTES_PACK_ID,
	name: 'The Disputes Desk (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0' },
	worlds: [disputesDesk],
	goalCards: disputesGoalCards,
	scenarios: disputesScenarios,
	campaigns: [
		{
			id: DISPUTES_BASELINE_ID,
			title: 'The Disputes Desk baseline',
			description:
				'The three decks under no guard, the four cards, and the cards with a local classifier — the hold, the limit and the classification as gates.',
			campaign: () => disputesBaseline()
		},
		{
			id: DISPUTES_BOOK_CAMPAIGN_ID,
			title: 'The disputes book by autonomy level',
			description:
				'The population’s disputed payments through the disputes journey under the five reference configurations — touches per case and the ceiling-breach rate by level.',
			campaign: () => disputesBookCampaign()
		}
	],
	policyCards: disputesPolicyCards,
	evaluators: disputesEvaluators,
	controlMaps: [disputesControlMap],
	workflows: [disputesWorkflow],
	stacks: disputesStacks
};

export default fsDisputesPack;

export { disputesStrings } from './strings.js';
export { claimFor, disputesBook, disputesBookFor, type DisputesBookOptions } from './book.js';
export {
	DISPUTES_CONFIGURATION_IDS,
	DISPUTES_CONFIGURATIONS,
	DISPUTES_STAGES,
	DISPUTES_WORKFLOW_ID,
	disputesDecisionKind,
	disputesWorkflow,
	figuresOnTheDesk,
	ruleVerdictOnTheDesk,
	type DisputesConfigurationId
} from './workflow.js';
export { DISPUTES_CEILINGS } from './decision-rights.js';
export { disputesCardId, disputesGoalCards } from './decks/goal-cards.js';
export {
	CLASSIFY_BEFORE_DECIDING,
	DISPUTES_POLICY_CARD_IDS,
	NO_REIMBURSEMENT_BEFORE_INVESTIGATION,
	REIMBURSEMENT_IS_FOUR_EYES,
	WITHIN_THE_LIMIT,
	disputesPolicyCards
} from './cards/policy.js';
export * from './evaluators/index.js';
export { DISPUTES_CONTROL_ROWS, disputesControlMap } from './controls/rows.js';
export {
	DISPUTES_DECKS,
	E as DISPUTES_EVALUATOR_IDS,
	disputesScenarios,
	scenariosInDisputesDeck,
	type DisputesDeck,
	type DisputesScenario
} from './decks/scenarios.js';
export {
	DISPUTES_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	disputesDesk,
	disputesDeskSpec,
	disputesLayouts,
	knobsOf,
	qualifyDisputesId,
	type DisputesDeskState
} from './world/desk.js';
export {
	DISPUTES_CASE_KINDS,
	MERCHANT_NOTE_INJECTION,
	assembleDisputesCase,
	disputesCase,
	disputesCaseFromItem,
	investigationFor,
	profileOf,
	type DisputeItemPayload,
	type DisputesCase,
	type DisputesCaseKind
} from './world/cases.js';
export {
	CLAIM_ITEM,
	CUSTOMER_RECORD,
	INVESTIGATION_RECORD,
	type Decision,
	type DisputeClaim,
	type DisputesExtra,
	type DisputesState
} from './world/extra.js';
export {
	CLASSIFICATIONS,
	DEFAULT_DISPUTES_POLICY,
	OUTCOMES,
	REASON_CODES,
	classificationOf,
	disputeVerdict,
	disputesPolicyFrom,
	disputesPolicySchema,
	isReasonCode,
	verdictFromFigures,
	type ClaimFigures,
	type Classification,
	type DisputesPolicy,
	type Outcome,
	type ReasonCode,
	type RuleFigures,
	type Verdict
} from './world/rules.js';
export {
	DISPUTES_BASELINE_ID,
	DISPUTES_BOOK_CAMPAIGN_ID,
	DISPUTES_GUARD_IDS,
	disputesBaseline,
	disputesBookCampaign,
	disputesStacks
} from './campaign.js';
export { disputesPersona, pressuredVictim, type DisputesPersonaId } from './personas.js';
