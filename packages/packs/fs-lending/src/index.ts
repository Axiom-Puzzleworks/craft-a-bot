import type { PackManifest } from '@craftabot/core';
import { lendingGoalCards } from './decks/goal-cards.js';
import { lendingScenarios } from './decks/scenarios.js';
import { lendingDesk } from './world/desk.js';

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
	scenarios: lendingScenarios
};

export default fsLendingPack;

export { lendingStrings } from './strings.js';
export { lendingCardId, lendingGoalCards } from './decks/goal-cards.js';
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
	lendingDesk,
	lendingDeskSpec,
	lendingLayouts,
	qualifyLendingId,
	type LendingDeskState
} from './world/desk.js';
export {
	LENDING_CASE_KINDS,
	lendingCase,
	profileOf,
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
	LENDING_RATE,
	OUTCOMES,
	REASON_CODES,
	affordabilityVerdict,
	isReasonCode,
	monthlyRepayment,
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
