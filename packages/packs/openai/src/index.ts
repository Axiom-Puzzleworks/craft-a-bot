import type { PackManifest } from '@craftabot/core';
import { openAiCartridges } from './catalogue.js';

/**
 * @craftabot/pack-openai — the OpenAI model cartridges (06-LLM-PROVIDERS.md §4).
 *
 * Deliberately a separate pack from `starter` even though both ship in V1: it
 * proves the cartridge/expansion mechanism works, and it is the template every
 * future LLM pack copies (01-ARCHITECTURE.md §2).
 */
export const openAiPack: PackManifest = {
	id: 'openai',
	name: 'OpenAI Model Cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: openAiCartridges
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
