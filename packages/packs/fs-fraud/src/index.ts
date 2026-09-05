import type { PackManifest } from '@craftabot/core';
import { fraudPolicyCards } from './cards/policy.js';
import { fraudGoalCards } from './decks/goal-cards.js';
import { fraudEvaluators } from './evaluators/index.js';
import { fraudScenarios } from './decks/scenarios.js';
import { fraudDesk } from './world/desk.js';

/**
 * @craftabot/pack-fs-fraud — **The Fraud Desk** (WP62, `51-FS-FRAUD.md`):
 * the second desk on the synthetic bank, written against the contracts
 * alone. Content and rules only — a `DeskWorldSpec` over the bank's
 * customers with a hand-built queue of alerts, decks, cards, evaluators,
 * a campaign. No runtime, no brick kind, no tool, no schema, and no import
 * from any other desk.
 */
export const FS_FRAUD_PACK_ID = 'fs-fraud';

export const fsFraudPack: PackManifest = {
	id: FS_FRAUD_PACK_ID,
	name: 'The Fraud Desk (synthetic)',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	requiresPacks: { 'fs-bank': '^1.0.0' },
	worlds: [fraudDesk],
	goalCards: fraudGoalCards,
	scenarios: fraudScenarios,
	policyCards: fraudPolicyCards,
	evaluators: fraudEvaluators
};

export default fsFraudPack;

export { fraudStrings } from './strings.js';
export {
	FRAUD_DESK_WORLD_ID,
	fraudDesk,
	fraudDeskSpec,
	fraudLayouts,
	qualifyFraudId,
	TIPPING_OFF_PATTERN,
	type FraudDeskState
} from './world/desk.js';
export {
	CRM_INJECTION,
	FRAUD_CASE_KINDS,
	fraudCase,
	profileOf,
	type CallerIdentity,
	type FraudCase,
	type FraudCaseKind
} from './world/cases.js';
export {
	alertKinds,
	alertRecord,
	summaryOf,
	type AlertLabel,
	type FraudAlert
} from './world/alerts.js';
export {
	ALERT_RECORD,
	DECISIONS,
	type Decision,
	type FraudExtra,
	type FraudState
} from './world/extra.js';
export {
	COACHED_ID,
	coachedCustomer,
	fraudPersona,
	WARNING_PATTERN,
	type FraudPersonaId
} from './personas.js';
export { fraudCardId, fraudGoalCards } from './decks/goal-cards.js';
export {
	CRM_POISON,
	FRAUD_DECKS,
	fraudScenarios,
	KYC_POISON,
	scenariosInFraudDeck,
	type FraudDeck,
	type FraudScenario
} from './decks/scenarios.js';
export {
	FRAUD_POLICY_CARD_IDS,
	FREEZE_NEEDS_A_SECOND_LOOK,
	NEVER_TIP_OFF,
	NO_AUTO_RELEASE_FROM_RECORDS,
	NO_SAR_WITHOUT_ESCALATION,
	TIPPING_OFF_WORDS,
	VERIFY_BEFORE_YOU_ACT_ON_A_CALL,
	fraudPolicyCards
} from './cards/policy.js';
export * from './evaluators/index.js';
export { FRAUD_CONTROL_ROWS } from './controls/rows.js';
