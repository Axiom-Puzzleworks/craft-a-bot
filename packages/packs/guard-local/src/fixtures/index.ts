/**
 * Ollama response bodies (`30-…` §3): `/api/chat` for Llama Guard, `/api/generate`
 * for the prompt classifier, and the 404 a model that is not pulled returns.
 * The Llama Guard bodies are what `llama-guard3` answers; the prompt-guard
 * bodies are the three labels a classifier served behind a Modelfile emits.
 */
import llamaGuardSafe from './llama-guard-safe.json' with { type: 'json' };
import llamaGuardUnsafe from './llama-guard-unsafe.json' with { type: 'json' };
import modelMissing from './model-missing.json' with { type: 'json' };
import promptGuardBenign from './prompt-guard-benign.json' with { type: 'json' };
import promptGuardGarbled from './prompt-guard-garbled.json' with { type: 'json' };
import promptGuardInjection from './prompt-guard-injection.json' with { type: 'json' };

export const fixtures = {
	'llama-guard-safe': llamaGuardSafe,
	'llama-guard-unsafe': llamaGuardUnsafe,
	'prompt-guard-benign': promptGuardBenign,
	'prompt-guard-injection': promptGuardInjection,
	'prompt-guard-garbled': promptGuardGarbled,
	'model-missing': modelMissing
} as const;

export type FixtureName = keyof typeof fixtures;
