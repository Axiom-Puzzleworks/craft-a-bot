import type { PackManifest } from '@craftabot/core';
import { guardServiceComponent } from '@craftabot/governance';
import { llamaGuardService } from './llama-guard.js';
import { promptGuardService } from './prompt-guard.js';

/**
 * `@craftabot/pack-guard-local` (`30-SECOND-VENDORS.md` D2, WP42): two
 * classifiers served by the user's own Ollama, as `GuardrailService`s and
 * nothing else — the proof that the shell does not care where a guard runs.
 * No credential, no brick kind; `workshop/guard` fits them, `localhost` is
 * the only host they declare.
 */

export const CRAFTABOT_PACK_GUARD_LOCAL_VERSION = '0.0.1';

const guardLocalPack: PackManifest = {
	id: 'guard-local',
	name: 'Local Guards',
	version: CRAFTABOT_PACK_GUARD_LOCAL_VERSION,
	requiresCore: '>=0.0.1',
	guardrailServices: [llamaGuardService, promptGuardService],
	/** WP94: the two classifiers as components, local over Ollama. */
	guardrailComponents: [
		guardServiceComponent(llamaGuardService, {
			wraps: 'meta/llama-guard-4',
			technique: 'hazard-classifier',
			kind: 'local'
		}) as never,
		guardServiceComponent(promptGuardService, {
			wraps: 'meta/prompt-guard-2',
			technique: 'input-classifier',
			kind: 'local'
		}) as never
	]
};

export default guardLocalPack;

export {
	LLAMA_GUARD_CATEGORIES,
	LLAMA_GUARD_RECORD_SERVICE,
	LLAMA_GUARD_SERVICE_ID,
	llamaGuardConfigSchema,
	llamaGuardService,
	llamaGuardServiceClient,
	readLlamaGuard,
	type LlamaGuardConfig
} from './llama-guard.js';
export {
	PROMPT_GUARD_RECORD_SERVICE,
	PROMPT_GUARD_SERVICE_ID,
	promptGuardConfigSchema,
	promptGuardService,
	promptGuardServiceClient,
	readPromptGuard,
	type PromptGuardConfig
} from './prompt-guard.js';
export {
	DEFAULT_OLLAMA_ENDPOINT,
	cannedOllamaClient,
	createOllamaClient,
	describeOllamaEndpoint,
	ollamaEndpointSchema,
	type OllamaClient,
	type OllamaError,
	type OllamaResult
} from './ollama.js';
export { fixtures, type FixtureName } from './fixtures/index.js';
