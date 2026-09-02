import type { EgressDeclaration, LLMProvider, PackManifest } from '@craftabot/core';
import { OPENAI_KEYS_URL, OPENAI_PROVIDER_ID, openAiCartridges } from './catalogue.js';
import { createOpenAIProvider } from './provider.js';

/**
 * @craftabot/pack-openai — the OpenAI model cartridges (06-LLM-PROVIDERS.md §4).
 *
 * Deliberately a separate pack from `starter` even though both ship in V1: it
 * proves the cartridge/expansion mechanism works, and it is the template every
 * future LLM pack copies (01-ARCHITECTURE.md §2).
 *
 * **Registers its own `ProviderFactory` (WP26)**, the same seam every other
 * provider pack uses — `apps/workbench/src/lib/brain.ts` no longer names
 * OpenAI specially, so this pack proves the seam by using it rather than
 * being the exception to it.
 */
/** Where this pack sends bytes (`26-…` §6.6, WP41) — the session refuses any other host. */
export const OPENAI_EGRESS: EgressDeclaration[] = [
	{ host: 'api.openai.com', purpose: 'LLM completions', sends: ['prompt', 'credential-header'] }
];

function withEgress(provider: LLMProvider, egress: EgressDeclaration[]): LLMProvider {
	return { ...provider, egress };
}

export const openAiPack: PackManifest = {
	id: 'openai',
	name: 'OpenAI Model Cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: openAiCartridges,
	providers: [
		{
			id: OPENAI_PROVIDER_ID,
			name: 'OpenAI',
			keyRequirement: 'required',
			egress: OPENAI_EGRESS,
			keysUrl: OPENAI_KEYS_URL,
			create: ({ apiKey, fetch }) =>
				withEgress(createOpenAIProvider({ apiKey, ...(fetch ? { fetch } : {}) }), OPENAI_EGRESS)
		}
	]
};

export default openAiPack;

export {
	FIXED_TEMPERATURE,
	MODELS,
	OPENAI_BASE_URL,
	OPENAI_KEYS_URL,
	OPENAI_PROVIDER_ID,
	openAiCartridges,
	reasoningEffortFor,
	supportsTemperature,
	type ReasoningEffort
} from './catalogue.js';
export { createOpenAIProvider, type OpenAiProviderOptions } from './provider.js';
export {
	OpenAiError,
	normaliseFiltered,
	normaliseHttpError,
	normaliseMalformed,
	normaliseNetworkError
} from './errors.js';
export { DONE, createSseParser, type SseFrame, type SseParser } from './sse.js';
export { buildRequestBody, createStreamAccumulator, streamChunkSchema } from './wire.js';
