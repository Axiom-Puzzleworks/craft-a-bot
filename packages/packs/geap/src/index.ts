/**
 * `@craftabot/pack-geap` — Stage A (`25-…` §11): the Model Armor client
 * library, offline and brick-free. `PackManifest`/`armorBrickKind` are added
 * in Stage D once the credential/network seams (Stage C) exist for a brick
 * to use.
 */

export { armorConfigSchema } from './armor/config.js';
export type { ArmorConfig, ArmorDisposition } from './armor/config.js';

export { createModelArmorClient, createOfflineArmorClient } from './armor/client.js';
export type { ArmorClient, ArmorClientResult, ModelArmorClientOptions } from './armor/client.js';

export { readSanitizationResult } from './armor/reading.js';
export type { ArmorFilterKey, ArmorFilterReading, ArmorReading } from './armor/reading.js';

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

export const CRAFTABOT_PACK_GEAP_VERSION = '0.0.1';
