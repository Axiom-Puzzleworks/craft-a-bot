import type { PackManifest } from '@craftabot/core';
import { lendingControlMap } from './controls/rows.js';
import { lendingPolicyCards } from './cards/policy.js';
import { lendingGoalCards } from './decks/goal-cards.js';
import { lendingEvaluators } from './evaluators/index.js';
import { lendingScenarios } from './decks/scenarios.js';
import {
	LENDING_BASELINE_ID,
	LENDING_BOOK_CAMPAIGN_ID,
	lendingBaseline,
	lendingBookCampaign,
	lendingStacks
} from './campaign.js';
import { lendingDesk } from './world/desk.js';
import { lendingWorkflow } from './workflow.js';

/**
 * @craftabot/pack-fs-lending — **The Lending Desk** (WP63, `52-FS-LENDING.md`):
 * the third desk on the synthetic bank, where a decision about a person is
 * made, explained and contested, and fairness across cohorts is the
 * question. Content and rules only — a `DeskWorldSpec` over the bank's
 * applicants with the bank's own lending rule in truth, decks, cards,
 * evaluators, a campaign. No runtime, no brick kind, no tool, no schema,
 * and no import from any other desk.
 */
export const FS_LENDING_PACK_ID = 'fs-lending';

export const fsLendingPack: PackManifest = {
	id: FS_LENDING_PACK_ID,
	name: 'The Lending Desk (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0' },
	worlds: [lendingDesk],
	goalCards: lendingGoalCards,
	scenarios: lendingScenarios,
	// The desk's baseline, offered by name on the Campaigns screen (UX-5).
	campaigns: [
		{
			id: LENDING_BASELINE_ID,
			title: 'The Lending Desk baseline',
			description:
				'Every lending deck under the five cards, four seeds — the first report with a matched parity gate.',
			campaign: () => lendingBaseline()
		},
		{
			id: LENDING_BOOK_CAMPAIGN_ID,
			title: 'The lending book by autonomy level',
			description:
				'The loan book through the lending journey under the five reference configurations — touches per case and the ceiling-breach rate by level. Drawn from a 500-customer population; the Books tab draws a smaller one.',
			campaign: () => lendingBookCampaign()
		}
	],
	policyCards: lendingPolicyCards,
	evaluators: lendingEvaluators,
	controlMaps: [lendingControlMap],
	// The lending journey as a workflow with its five reference configurations (WP80, `73-…`).
	workflows: [lendingWorkflow],
	/** WP97 (`89-STACKS.md`): the baseline's guards as stacks. */
	stacks: lendingStacks
};

export default fsLendingPack;

export { lendingStrings } from './strings.js';
export { lendingBook, type LendingBookOptions } from './book.js';
export {
	LENDING_CONFIGURATION_IDS,
	LENDING_CONFIGURATIONS,
	LENDING_STAGES,
	LENDING_WORKFLOW_ID,
	figuresOnTheDesk,
	lendingBookFor,
	lendingDecisionKind,
	lendingWorkflow,
	ruleVerdictOnTheDesk,
	type LendingConfigurationId
} from './workflow.js';
export {
	AUTONOMY_LABELS,
	DECISION_RIGHTS,
	DECISION_RIGHTS_SOURCE,
	LENDING_CEILINGS,
	type DecisionRight
} from './decision-rights.js';
export { lendingCardId, lendingGoalCards } from './decks/goal-cards.js';
export {
	COHORT_BLIND,
	DISBURSEMENT_IS_FOUR_EYES,
	LENDING_POLICY_CARD_IDS,
	NO_DECISION_BEFORE_AFFORDABILITY,
	REASONS_ARE_REAL,
	REFER_WHEN_THE_RULES_SAY_REFER,
	UNREVEALED_ATTRIBUTE_WORDS,
	lendingPolicyCards
} from './cards/policy.js';
export * from './evaluators/index.js';
export { LENDING_CONTROL_ROWS, lendingControlMap } from './controls/rows.js';
export {
	BUREAU_POISON,
	LENDING_DECKS,
	lendingScenarios,
	scenariosInLendingDeck,
	type LendingDeck,
	type LendingScenario
} from './decks/scenarios.js';
export {
	LENDING_DESK_WORLD_ID,
	WORK_ITEM_LAYOUT,
	knobsOf,
	lendingDesk,
	lendingDeskSpec,
	lendingLayouts,
	qualifyLendingId,
	type LendingDeskState
} from './world/desk.js';
export {
	LENDING_CASE_KINDS,
	assembleLendingCase,
	lendingCase,
	lendingCaseFromItem,
	profileOf,
	type ApplicationItemPayload,
	type LendingCase,
	type LendingCaseKind,
	type PairSide
} from './world/cases.js';
export {
	APPLICATION_ITEM,
	PAYSLIP_RECORD,
	STATEMENT_RECORD,
	WORKSHEET_RECORD,
	type Decision,
	type LendingExtra,
	type LendingState
} from './world/extra.js';
export {
	DEFAULT_LENDING_POLICY,
	LENDING_KNOB_IDS,
	LENDING_RATE,
	OUTCOMES,
	REASON_CODES,
	affordabilityVerdict,
	affordabilityVerdictWith,
	lendingPolicyFrom,
	lendingPolicySchema,
	isReasonCode,
	monthlyRepayment,
	monthlyRepaymentWith,
	verdictFromFigures,
	type LendingPolicy,
	type RuleFigures,
	type Application,
	type Evidence,
	type Outcome,
	type ReasonCode,
	type Verdict
} from './world/rules.js';
export {
	AGGRIEVED_ID,
	APPEAL_PATTERN,
	SUPPORT_NEED_SKIP_ID,
	aggrievedApplicant,
	lendingPersona,
	supportNeedSkip,
	type LendingPersonaId
} from './personas.js';
export {
	LENDING_BASELINE_ID,
	LENDING_BOOK_CAMPAIGN_ID,
	LENDING_GUARD_IDS,
	MATCHED_PAIR_SCENARIO,
	lendingBaseline,
	lendingBookCampaign,
	type LendingBaselineOptions,
	type LendingBookCampaignOptions
} from './campaign.js';
