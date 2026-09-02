import type { EgressDeclaration, LLMProvider, PackManifest } from '@craftabot/core';
import { GEMINI_KEYS_URL, GEMINI_PROVIDER_ID, geminiCartridges } from './catalogue.js';
import { createGeminiProvider } from './provider.js';

/**
 * @craftabot/pack-gemini — the Gemini model cartridges (`06-…` §8, WP26).
 * The second of the LLM Multi-Pack's three real provider integrations, built
 * against `@craftabot/pack-openai`'s template and the provider registry
 * seam (`core/types/provider.ts`).
 */
/** Where this pack sends bytes (`26-…` §6.6, WP41) — the session refuses any other host. */
export const GEMINI_EGRESS: EgressDeclaration[] = [
	{
		host: 'generativelanguage.googleapis.com',
		purpose: 'LLM completions',
		sends: ['prompt', 'credential-header']
	}
];

function withEgress(provider: LLMProvider, egress: EgressDeclaration[]): LLMProvider {
	return { ...provider, egress };
}

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
			egress: GEMINI_EGRESS,
			keysUrl: GEMINI_KEYS_URL,
			create: ({ apiKey, fetch }) =>
				withEgress(createGeminiProvider({ apiKey, ...(fetch ? { fetch } : {}) }), GEMINI_EGRESS)
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
