import type { PackManifest } from '@craftabot/core';
import { guardServiceComponent } from '@craftabot/governance';
import { cedarService } from './service.js';

/**
 * **`@craftabot/pack-pdp-cedar`** (WP144, `110-CONTROL-SUITE-PLAN.md` §10):
 * Cedar through Amazon Verified Permissions as a policy decision point, on
 * the guard shell beside OPA — a service and a component whose connection is
 * declared: SigV4, one regional host, the offline stand-in, **not
 * browser-capable**. **A harness pack**: the default host installs it; the
 * Workshop's editions do not. Connectable, checkpoint pending.
 */
export const CRAFTABOT_PACK_PDP_CEDAR_VERSION = '0.0.1';

const pdpCedarPack: PackManifest = {
	id: 'pdp-cedar',
	name: 'Policy Engine (Cedar)',
	version: CRAFTABOT_PACK_PDP_CEDAR_VERSION,
	requiresCore: '>=0.0.1',
	guardrailServices: [cedarService],
	guardrailComponents: [
		guardServiceComponent(cedarService, {
			wraps: 'aws/verified-permissions',
			technique: 'policy-as-code',
			kind: 'policy-engine',
			browserCapable: false,
			version: 'IsAuthorized 2021-12-01',
			perCall: 'per authorisation request, Amazon Verified Permissions pricing'
		}) as never
	]
};

export default pdpCedarPack;

export {
	CEDAR_CREDENTIAL_ID,
	RECORD_SERVICE,
	SERVICE_ID,
	cedarConfigSchema,
	cedarService,
	cedarServiceClient,
	createCedarClient,
	describeEndpoint,
	isAuthorizedRequest,
	isAuthorizedResponseSchema,
	readDecision,
	type CedarClient,
	type CedarConfig,
	type CedarError,
	type IsAuthorizedResponse
} from './service.js';
export { fixtures, type FixtureName } from './fixtures/index.js';
