import type { PackManifest } from '@craftabot/core';
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
	worlds: [fraudDesk]
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
