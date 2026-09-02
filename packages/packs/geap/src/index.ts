import type { PackManifest } from '@craftabot/core';
import { armorBrickKind } from './armor/brick-kind.js';
import { modelArmorService } from './armor/service.js';

/**
 * `@craftabot/pack-geap` — the Model Armor client library (Stage A), the
 * hosted-call trace record (Stage B), the credential/network core seam it
 * runs on (Stage C), and now the fitted kind itself (`25-…` §11 Stage D):
 * `geap/armor`, the Armour Brick, Workshop-only, in the `safety` socket
 * beside the Safety Brick and the Watchbot.
 */

export { armorConfigSchema } from './armor/config.js';
export type { ArmorConfig, ArmorDisposition } from './armor/config.js';

export {
	createModelArmorClient,
	createOfflineArmorClient,
	describeEndpoint
} from './armor/client.js';
export type { ArmorClient, ArmorClientResult, ModelArmorClientOptions } from './armor/client.js';

export {
	ARMOR_CATEGORY,
	ARMOR_FILTER_KEYS,
	readSanitizationResult,
	toScreenReading
} from './armor/reading.js';
export type { ArmorFilterKey, ArmorFilterReading, ArmorReading } from './armor/reading.js';

/** Model Armor as a `GuardrailService` (`29-GUARD-SHELL.md` §4.5, WP39) — what the generic Guard brick fits. */
export {
	armorSelectors,
	armorServiceClient,
	armorServiceConfigSchema,
	armorStrings,
	modelArmorService,
	screeningFor,
	serviceConfigFor,
	toScreenResult
} from './armor/service.js';
export type { ArmorServiceConfig } from './armor/service.js';

export {
	armorErrorFromNetworkFailure,
	armorErrorFromStatus,
	armorErrorFromTimeout,
	scrubToken
} from './armor/errors.js';
export type { ArmorError, ArmorErrorKind } from './armor/errors.js';

export { decisionText, observationText, resultText } from './armor/text.js';
export type { DecisionScreen } from './armor/text.js';

export { composeMatchReason, transportReason } from './armor/strings.js';
export type { MatchedFilter } from './armor/strings.js';

export { armorGuardrail, verdictFor } from './armor/guardrails.js';
export type { ArmorTextSelector } from './armor/guardrails.js';

export { KNOWN_INJECTION, validateArmourCredential } from './armor/validate.js';

export {
	ARMOR_CREDENTIAL_ID,
	armorBrickKind,
	armorConfigDefaults,
	describeArmorFitted
} from './armor/brick-kind.js';

export const CRAFTABOT_PACK_GEAP_VERSION = '0.0.1';

const geapPack: PackManifest = {
	id: 'geap',
	name: 'Cloud Armour',
	version: CRAFTABOT_PACK_GEAP_VERSION,
	requiresCore: '>=0.0.1',
	brickKinds: [armorBrickKind],
	guardrailServices: [modelArmorService]
};

export default geapPack;
