import type { PackManifest } from '@craftabot/core';
import { guardServiceComponent } from '@craftabot/governance';
import { contentSafetyService } from './service.js';

/**
 * `@craftabot/pack-azure-content-safety` (`30-SECOND-VENDORS.md`, WP42): the
 * enterprise vendor chosen at stage A, as a `GuardrailService` and nothing
 * else — no brick kind, no mechanism. `workshop/guard` is how it is fitted;
 * the shell in `@craftabot/governance` is how it screens.
 */

export const CRAFTABOT_PACK_AZURE_CONTENT_SAFETY_VERSION = '0.0.1';

const azureContentSafetyPack: PackManifest = {
	id: 'azure-content-safety',
	name: 'Azure Content Safety',
	version: CRAFTABOT_PACK_AZURE_CONTENT_SAFETY_VERSION,
	requiresCore: '>=0.0.1',
	guardrailServices: [contentSafetyService],
	/** WP94: the service as a component. */
	guardrailComponents: [
		guardServiceComponent(contentSafetyService, {
			wraps: 'azure/content-safety',
			technique: 'hazard-classifier',
			perCall: 'per text record, Azure AI Content Safety pricing'
		}) as never
	]
};

export default azureContentSafetyPack;

export {
	CONTENT_SAFETY_CREDENTIAL_ID,
	KNOWN_ATTACK,
	RECORD_SERVICE,
	SERVICE_ID,
	contentSafetyConfigSchema,
	contentSafetyService,
	contentSafetyServiceClient,
	validateContentSafetyKey,
	type ContentSafetyConfig
} from './service.js';
export {
	API_VERSION,
	KEY_HEADER,
	createContentSafetyClient,
	describeEndpoint,
	scrubKey,
	type ContentSafetyClient,
	type ContentSafetyError
} from './client.js';
export {
	HARM_CATEGORIES,
	analyzeFindings,
	analyzeResponseSchema,
	confidenceForSeverity,
	shieldFindings,
	shieldPromptResponseSchema,
	toScreenReading
} from './reading.js';
export { fixtures, type FixtureName } from './fixtures/index.js';
