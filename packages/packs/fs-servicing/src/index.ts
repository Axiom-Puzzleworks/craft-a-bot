import type { PackManifest } from '@craftabot/core';
import { servicingPolicyCards } from './cards/policy.js';
import { servicingControlMap } from './controls/rows.js';
import { servicingGoalCards } from './decks/goal-cards.js';
import { servicingScenarios } from './decks/scenarios.js';
import { servicingEvaluators } from './evaluators/index.js';
import {
	SERVICING_BASELINE_ID,
	SERVICING_BOOK_CAMPAIGN_ID,
	servicingBaseline,
	servicingBookCampaign,
	servicingStacks
} from './campaign.js';
import { servicingDesk } from './world/desk.js';
import { servicingWorkflow } from './workflow.js';

/**
 * @craftabot/pack-fs-servicing — **The Servicing Desk** (WP106,
 * `92-FS-SERVICING.md`): the seventh desk on the synthetic bank, where a
 * service request is met — the caller identified against the file, the
 * request classified, a support need recorded as said before the act, the
 * file changed only for a verified caller and only as the request calls
 * for, a closure under four eyes, a bereavement's estate handed to advice
 * and a disclosed need in arrears handed to collections. Content and rules
 * only: no runtime, no brick kind, no tool, no schema, and no import from
 * any other desk.
 */
export const FS_SERVICING_PACK_ID = 'fs-servicing';

export const fsServicingPack: PackManifest = {
	id: FS_SERVICING_PACK_ID,
	name: 'The Servicing Desk (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0' },
	worlds: [servicingDesk],
	goalCards: servicingGoalCards,
	scenarios: servicingScenarios,
	campaigns: [
		{
			id: SERVICING_BASELINE_ID,
			title: 'The Servicing Desk baseline',
			description:
				'The three decks under no guard, the four cards, and the cards with a local classifier — the verification, the disclosure and the needs met as gates.',
			campaign: () => servicingBaseline()
		},
		{
			id: SERVICING_BOOK_CAMPAIGN_ID,
			title: 'The servicing book by autonomy level',
			description:
				'The population’s service requests through the servicing journey under the five reference configurations — touches per case and the ceiling-breach rate by level.',
			campaign: () => servicingBookCampaign()
		}
	],
	policyCards: servicingPolicyCards,
	evaluators: servicingEvaluators,
	controlMaps: [servicingControlMap],
	workflows: [servicingWorkflow],
	stacks: servicingStacks
};

export default fsServicingPack;

export { servicingStrings } from './strings.js';
export { requestFor, servicingBook, servicingBookFor, type ServicingBookOptions } from './book.js';
export {
	SERVICING_CONFIGURATION_IDS,
	SERVICING_CONFIGURATIONS,
	SERVICING_STAGES,
	SERVICING_WORKFLOW_ID,
	servicingDecisionKind,
	servicingWorkflow,
	type ServicingConfigurationId
} from './workflow.js';
export { SERVICING_CEILINGS } from './decision-rights.js';
export { servicingCardId, servicingGoalCards } from './decks/goal-cards.js';
export {
	ACCESS_ON_AN_AUTHORITY,
	CLOSURE_IS_FOUR_EYES,
	RECORD_A_DISCLOSURE,
	SERVICING_POLICY_CARD_IDS,
	VERIFY_BEFORE_ACT,
	servicingPolicyCards
} from './cards/policy.js';
export * from './evaluators/index.js';
export { SERVICING_CONTROL_ROWS, servicingControlMap } from './controls/rows.js';
export {
	E as SERVICING_EVALUATOR_IDS,
	SERVICING_DECKS,
	scenariosInServicingDeck,
	servicingScenarios,
	type ServicingDeck,
	type ServicingScenario
} from './decks/scenarios.js';
export {
	SERVICING_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	qualifyServicingId,
	servicingDesk,
	servicingDeskSpec,
	servicingLayouts,
	type ServicingDeskState
} from './world/desk.js';
export {
	SERVICING_CASE_KINDS,
	assembleServicingCase,
	profileOf,
	servicingCase,
	servicingCaseFromItem,
	type ServicingCase,
	type ServicingCaseKind,
	type ServicingItemPayload
} from './world/cases.js';
export {
	CUSTOMER_RECORD,
	REQUEST_ITEM,
	type ServiceRequest,
	type ServicingExtra,
	type ServicingState
} from './world/extra.js';
export {
	CATEGORIES,
	DRIVER_GROUP,
	SUPPORT_NEEDS,
	actFor,
	classificationOf,
	needIn,
	verdictFromFigures,
	type Act,
	type Category,
	type DriverGroup,
	type RuleFigures,
	type SupportNeed,
	type Verdict
} from './world/rules.js';
export {
	SERVICING_BASELINE_ID,
	SERVICING_BOOK_CAMPAIGN_ID,
	SERVICING_GUARD_IDS,
	servicingBaseline,
	servicingBookCampaign,
	servicingStacks
} from './campaign.js';
export {
	bereavedCaller,
	disclosingMover,
	servicingPersona,
	type ServicingPersonaId
} from './personas.js';
