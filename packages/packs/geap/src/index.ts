import type { PackManifest } from '@craftabot/core';
import { guardServiceComponent } from '@craftabot/governance';
import { armorBrickKind } from './armor/brick-kind.js';
import { modelArmorService } from './armor/service.js';
import { evalEvaluators } from './eval/evaluator.js';

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
	toScreenResult,
	STREAMING_SANITISATION
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

/** The Gen AI evaluation service as `geap/eval/*` (`39-HOSTED-EVALUATOR.md`, WP51) — the second GEAP integration, on the same battery. */
export {
	EVAL_ID_PREFIX,
	evalConfigSchema,
	evalEvaluator,
	evalEvaluators,
	evalIdFor,
	evalRequestFor,
	evaluateWithService,
	fulfillmentEvaluator,
	offlineResult,
	rubricEvaluator,
	safetyEvaluator
} from './eval/evaluator.js';
export type { EvalConfig, EvalConfigInput } from './eval/evaluator.js';
export { createEvalClient, describeEvalEndpoint } from './eval/client.js';
export type { EvalClient, EvalClientOptions, EvalClientResult } from './eval/client.js';
export { EVAL_METRICS, normaliseScore, readEvalResponse } from './eval/reading.js';
export type { EvalMetric, EvalReading } from './eval/reading.js';
export { goalText, renderTranscript, transcriptText } from './eval/transcript.js';
export type { TranscriptLine } from './eval/transcript.js';
/** The response envelopes the evaluators are proven against — a host's tests answer with them. */
export { evalFixtures } from './fixtures/eval/index.js';
export type { EvalFixtureName } from './fixtures/eval/index.js';

export const CRAFTABOT_PACK_GEAP_VERSION = '0.0.1';

const geapPack: PackManifest = {
	id: 'geap',
	name: 'Cloud Armour',
	version: CRAFTABOT_PACK_GEAP_VERSION,
	requiresCore: '>=0.0.1',
	brickKinds: [armorBrickKind],
	guardrailServices: [modelArmorService],
	/** WP94: the service as a component — Model Armor's filter v3 is the surface the adapter targets (`83-…` §6.2.4). */
	guardrailComponents: [
		guardServiceComponent(modelArmorService, {
			wraps: 'google/model-armor',
			technique: 'input-classifier',
			version: 'v3',
			// The live Google Cloud checkpoint (WP35, `25-…` stage E): a real verdict, and the CORS go on direct browser calls.
			checkpoint: {
				takenOn: '2026-09-01',
				note: 'A real Model Armor verdict from the browser; CORS answered (25-ARMOUR-BRICK.md stage E).'
			},
			perCall: 'per screened request, Model Armor pricing'
		}) as never
	],
	evaluators: [...evalEvaluators]
};

export default geapPack;
