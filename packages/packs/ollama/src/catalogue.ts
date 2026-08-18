import type { CartridgeDefinition } from '@craftabot/core';

/**
 * **The one place Ollama model tags appear** (`06-…` §4's discipline, carried
 * over again) — with a caveat none of the other two providers share: these
 * are *suggestions*, not a guarantee. Ollama runs whatever the person has
 * pulled locally; a cartridge naming a tag nobody pulled fails with a plain
 * "model not found" the moment it is used, not before (`errors.ts`).
 */

export const OLLAMA_PROVIDER_ID = 'ollama';

/**
 * **Fixed, not configurable — deliberately, for now.** `06-…` §5 flagged
 * exactly this: "no proxy in V1... no custom endpoint field in V1 — an
 * SSRF/phishing foot-gun for beginners; revisit for Ollama later with
 * `localhost`-only validation." This pack is that "later", and the honest
 * answer is that the safe version of "later" — a custom-endpoint field that
 * validates it is still `localhost` before accepting it — is a real,
 * separate piece of scope (a Settings field, a validator, its own tests),
 * not a line changed alongside three other providers. Hardcoding the
 * default port keeps this pack exactly as safe as the fixed-constant
 * discipline every other provider already follows, and ships a genuinely
 * working local provider today rather than a placeholder for a feature that
 * does not exist yet.
 */
export const OLLAMA_BASE_URL = 'http://localhost:11434/v1';

/**
 * Suggested local tags, not a guarantee anyone has them — genuinely
 * different from the other two packs, where the catalogue names models the
 * provider is known to serve. `errors.ts` turns "not pulled" into a plain
 * instruction rather than a mystery 404.
 */
export const MODELS = {
	quick: 'llama3.2',
	deep: 'qwen2.5:14b',
	penny: 'llama3.2:1b'
} as const;

export const ollamaCartridges: CartridgeDefinition[] = [
	{
		id: 'ollama/quick-llama',
		providerId: OLLAMA_PROVIDER_ID,
		model: MODELS.quick,
		displayName: 'Quick Llama',
		blurb: 'Runs on your own computer — fast and cheerful.',
		stats: { words: 2, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: 1, maxTokens: 800 }
	},
	{
		id: 'ollama/deep-llama',
		providerId: OLLAMA_PROVIDER_ID,
		model: MODELS.deep,
		displayName: 'Deep Llama',
		blurb: 'A bigger local model — slower, but plans ahead.',
		stats: { words: 3, reasoning: 3, speed: 1 },
		costHint: 'low',
		defaults: { temperature: 1, maxTokens: 1500 }
	},
	{
		id: 'ollama/penny-llama',
		providerId: OLLAMA_PROVIDER_ID,
		model: MODELS.penny,
		displayName: 'Penny Llama',
		blurb: 'Tiny and thrifty; watch it struggle with hard goals!',
		stats: { words: 1, reasoning: 1, speed: 3 },
		costHint: 'low',
		defaults: { temperature: 1, maxTokens: 600 }
	}
];
