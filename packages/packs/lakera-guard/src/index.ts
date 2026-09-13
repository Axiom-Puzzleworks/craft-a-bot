import type { PackManifest } from '@craftabot/core';
import { guardServiceComponent } from '@craftabot/governance';
import { lakeraGuardService } from './service.js';

/**
 * **`@craftabot/pack-lakera-guard`** (WP99, `30-SECOND-VENDORS.md`'s dated
 * note; `83-…` §6.2.4): Lakera Guard on the guard shell, as a service and as
 * a component whose connection is declared — bearer-token, one host, the
 * offline stand-in, the browser checkpoint pending. **A harness pack**: the
 * default host installs it; the Workshop's editions do not, and the Guard
 * Rack says why when it lists a harness-only connection.
 */
export const CRAFTABOT_PACK_LAKERA_GUARD_VERSION = '0.0.1';

const lakeraGuardPack: PackManifest = {
	id: 'lakera-guard',
	name: 'Lakera Guard',
	version: CRAFTABOT_PACK_LAKERA_GUARD_VERSION,
	requiresCore: '>=0.0.1',
	guardrailServices: [lakeraGuardService],
	guardrailComponents: [
		guardServiceComponent(lakeraGuardService, {
			wraps: 'lakera/guard',
			technique: 'input-classifier',
			browserCapable: 'checkpoint-pending',
			version: 'v2',
			perCall: 'per request, Lakera pricing'
		}) as never
	]
};

export default lakeraGuardPack;

export {
	DEFAULT_ENDPOINT,
	KNOWN_ATTACK,
	LAKERA_CREDENTIAL_ID,
	RECORD_SERVICE,
	SERVICE_ID,
	categoryFor,
	createLakeraClient,
	describeEndpoint,
	guardResponseSchema,
	lakeraConfigSchema,
	lakeraGuardService,
	lakeraServiceClient,
	scrubKey,
	toScreenReading,
	validateLakeraKey,
	type GuardResponse,
	type LakeraClient,
	type LakeraConfig,
	type LakeraError
} from './service.js';
export { fixtures, type FixtureName } from './fixtures/index.js';
