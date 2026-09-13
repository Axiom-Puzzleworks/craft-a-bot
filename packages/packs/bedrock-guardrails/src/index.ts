import type { PackManifest } from '@craftabot/core';
import { guardServiceComponent } from '@craftabot/governance';
import { bedrockGuardrailsService } from './service.js';

/**
 * **`@craftabot/pack-bedrock-guardrails`** (WP99, `30-SECOND-VENDORS.md`'s
 * dated note; `83-…` §6.2.4): Amazon Bedrock Guardrails on the guard shell,
 * as a service and as a component whose connection is declared — SigV4,
 * one regional host, the offline stand-in, **not browser-capable** and never
 * will be under this architecture. **A harness pack**: the default host
 * installs it; the Workshop's editions do not.
 */
export const CRAFTABOT_PACK_BEDROCK_GUARDRAILS_VERSION = '0.0.1';

const bedrockGuardrailsPack: PackManifest = {
	id: 'bedrock-guardrails',
	name: 'Bedrock Guardrails',
	version: CRAFTABOT_PACK_BEDROCK_GUARDRAILS_VERSION,
	requiresCore: '>=0.0.1',
	guardrailServices: [bedrockGuardrailsService],
	guardrailComponents: [
		guardServiceComponent(bedrockGuardrailsService, {
			wraps: 'aws/bedrock-guardrails',
			technique: 'input-classifier',
			browserCapable: false,
			version: 'ApplyGuardrail 2023-09-30',
			perCall: 'per text unit, Amazon Bedrock Guardrails pricing'
		}) as never
	]
};

export default bedrockGuardrailsPack;

export {
	BEDROCK_CREDENTIAL_ID,
	KNOWN_ATTACK,
	RECORD_SERVICE,
	SERVICE_ID,
	applyGuardrailResponseSchema,
	bedrockConfigSchema,
	bedrockGuardrailsService,
	bedrockServiceClient,
	categoryForFilter,
	createBedrockClient,
	describeEndpoint,
	scrubSecret,
	toScreenReading,
	validateBedrockCredential,
	type ApplyGuardrailResponse,
	type BedrockClient,
	type BedrockConfig,
	type BedrockError
} from './service.js';
export { parseCredential, signRequest, type SigV4Credentials, type SigV4Request } from './sigv4.js';
export { fixtures, type FixtureName } from './fixtures/index.js';
