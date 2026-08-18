import type { PackManifest } from '@craftabot/core';
import { ANTHROPIC_KEYS_URL, ANTHROPIC_PROVIDER_ID, anthropicCartridges } from './catalogue.js';
import { createAnthropicProvider } from './provider.js';

/**
 * @craftabot/pack-anthropic — the Anthropic model cartridges (`06-…` §8,
 * WP26). One of the LLM Multi-Pack's three real provider integrations,
 * built against `@craftabot/pack-openai`'s own template
 * (`01-ARCHITECTURE.md` §2) and the provider registry seam WP26 added ahead
 * of this pack (`core/types/provider.ts`).
 */
export const anthropicPack: PackManifest = {
	id: 'anthropic',
	name: 'Anthropic Model Cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: anthropicCartridges,
	providers: [
		{
			id: ANTHROPIC_PROVIDER_ID,
			name: 'Anthropic',
			keyRequirement: 'required',
			keysUrl: ANTHROPIC_KEYS_URL,
			create: ({ apiKey, fetch }) =>
				createAnthropicProvider({ apiKey, ...(fetch ? { fetch } : {}) })
		}
	]
};

export default anthropicPack;

export {
	ANTHROPIC_BASE_URL,
	ANTHROPIC_KEYS_URL,
	ANTHROPIC_PROVIDER_ID,
	ANTHROPIC_VERSION,
	MAX_TEMPERATURE,
	MODELS,
	anthropicCartridges
} from './catalogue.js';
export { createAnthropicProvider, type AnthropicProviderOptions } from './provider.js';
export {
	AnthropicError,
	normaliseFiltered,
	normaliseHttpError,
	normaliseMalformed,
	normaliseNetworkError
} from './errors.js';
export { DONE, createSseParser, type SseFrame, type SseParser } from './sse.js';
export {
	buildRequestBody,
	clampTemperature,
	createStreamAccumulator,
	streamChunkSchema
} from './wire.js';
