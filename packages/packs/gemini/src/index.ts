import type { PackManifest } from '@craftabot/core';
import { GEMINI_KEYS_URL, GEMINI_PROVIDER_ID, geminiCartridges } from './catalogue.js';
import { createGeminiProvider } from './provider.js';

/**
 * @craftabot/pack-gemini — the Gemini model cartridges (`06-…` §8, WP26).
 * The second of the LLM Multi-Pack's three real provider integrations, built
 * against `@craftabot/pack-openai`'s template and the provider registry
 * seam (`core/types/provider.ts`).
 */
export const geminiPack: PackManifest = {
	id: 'gemini',
	name: 'Gemini Model Cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: geminiCartridges,
	providers: [
		{
			id: GEMINI_PROVIDER_ID,
			name: 'Gemini',
			keyRequirement: 'required',
			keysUrl: GEMINI_KEYS_URL,
			create: ({ apiKey, fetch }) => createGeminiProvider({ apiKey, ...(fetch ? { fetch } : {}) })
		}
	]
};

export default geminiPack;

export {
	GEMINI_BASE_URL,
	GEMINI_KEYS_URL,
	GEMINI_PROVIDER_ID,
	MODELS,
	geminiCartridges
} from './catalogue.js';
export { createGeminiProvider, type GeminiProviderOptions } from './provider.js';
export {
	GeminiError,
	normaliseFiltered,
	normaliseHttpError,
	normaliseMalformed,
	normaliseNetworkError
} from './errors.js';
export { DONE, createSseParser, type SseFrame, type SseParser } from './sse.js';
export { buildRequestBody, createStreamAccumulator, streamChunkSchema } from './wire.js';
