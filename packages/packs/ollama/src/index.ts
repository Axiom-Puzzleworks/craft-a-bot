import type { PackManifest } from '@craftabot/core';
import { OLLAMA_PROVIDER_ID, ollamaCartridges } from './catalogue.js';
import { createOllamaProvider } from './provider.js';

/**
 * @craftabot/pack-ollama — local model cartridges (`06-…` §8, WP26). The
 * third and last of the LLM Multi-Pack's real provider integrations: no
 * key, no billing, run entirely on the builder's own computer against
 * Ollama's OpenAI-compatible `/v1/chat/completions` endpoint.
 *
 * `keyRequirement: 'none'` means Settings never grows a compartment for
 * this one — there is nothing to plug in — and `brain.ts`'s `chooseBrain`
 * calls `create({apiKey: ''})` straight away rather than checking the vault
 * first, the same branch a keyless provider always takes.
 */
export const ollamaPack: PackManifest = {
	id: 'ollama',
	name: 'Ollama Local Cartridges',
	version: '1.0.0',
	requiresCore: '>=0.0.1',
	cartridges: ollamaCartridges,
	providers: [
		{
			id: OLLAMA_PROVIDER_ID,
			name: 'Ollama',
			keyRequirement: 'none',
			create: ({ fetch }) => createOllamaProvider({ ...(fetch ? { fetch } : {}) })
		}
	]
};

export default ollamaPack;

export { OLLAMA_BASE_URL, OLLAMA_PROVIDER_ID, MODELS, ollamaCartridges } from './catalogue.js';
export { createOllamaProvider, type OllamaProviderOptions } from './provider.js';
export {
	OllamaError,
	normaliseFiltered,
	normaliseHttpError,
	normaliseMalformed,
	normaliseNetworkError
} from './errors.js';
export { DONE, createSseParser, type SseFrame, type SseParser } from './sse.js';
export { buildRequestBody, createStreamAccumulator, streamChunkSchema } from './wire.js';
