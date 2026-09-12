import type { PackManifest } from '@craftabot/core';
import { guardServiceComponent } from '@craftabot/governance';
import { opaService } from './service.js';

/**
 * **`@craftabot/pack-pdp-opa`** (`33-POLICY-V2-PDP.md` §4.3, WP45): Open
 * Policy Agent as a policy decision point — a `GuardrailService` at
 * `pre-act` fitted through `workshop/guard`, stacking with `starter/safety`
 * like any other. Content only: the service and its fixtures.
 */

export const CRAFTABOT_PACK_PDP_OPA_VERSION = '0.0.1';

const pdpOpaPack: PackManifest = {
	id: 'pdp-opa',
	name: 'Policy Engine (OPA)',
	version: CRAFTABOT_PACK_PDP_OPA_VERSION,
	requiresCore: '>=0.0.1',
	guardrailServices: [opaService],
	/** WP94: the policy decision point as a component — a policy engine, self-hosted. */
	guardrailComponents: [
		guardServiceComponent(opaService, {
			wraps: 'open-policy-agent',
			technique: 'policy-as-code',
			kind: 'policy-engine',
			// The live OPA checkpoint (WP45, `33-…`): a real decision from a local OPA.
			checkpoint: {
				takenOn: '2026-09-02',
				note: 'A real allow and deny from a local OPA (33-POLICY-V2-PDP.md).'
			}
		}) as never
	]
};

export default pdpOpaPack;

export {
	RECORD_SERVICE,
	SERVICE_ID,
	opaConfigSchema,
	opaService,
	opaServiceClient,
	type OpaConfig
} from './service.js';
export {
	DEFAULT_DECISION_PATH,
	DEFAULT_OPA_URL,
	createOpaClient,
	decisionPathSchema,
	describeDecisionEndpoint,
	opaUrlSchema,
	type OpaClient,
	type OpaError
} from './client.js';
export {
	ALLOW_LABEL,
	decisionSchema,
	findingsFor,
	opaResponseSchema,
	readDecision,
	type Decision
} from './reading.js';
export { fixtures, type FixtureName } from './fixtures/index.js';
