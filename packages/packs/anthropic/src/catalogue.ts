import type { CartridgeDefinition } from '@craftabot/core';

/**
 * **The one place Anthropic model ids appear** (`06-…` §4's discipline,
 * carried over: Anthropic renames and retires models too, so updating this
 * catalogue is meant to stay a one-file change).
 */

export const ANTHROPIC_PROVIDER_ID = 'anthropic';

/** Fixed constant — the UI never builds this from user input (06 §5). */
export const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1';

/**
 * Required on every Messages API call (`06-…` §5's "no SDKs" survives here
 * too — the version string is what a client SDK would otherwise pin for you).
 */
export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Unlike OpenAI's three cartridges (one model family, tuned differently),
 * Anthropic genuinely ships three tiers — Haiku, Sonnet, Opus — so the
 * quick/deep/penny split maps onto real model boundaries rather than a
 * config difference on the same model.
 */
export const MODELS = {
	quick: 'claude-sonnet-4-5',
	deep: 'claude-opus-4-1',
	penny: 'claude-haiku-4-5'
} as const;

/**
 * **Temperature is capped at 1, not 2** (unlike OpenAI's dial range, which
 * this cartridge line otherwise mirrors). Anthropic's Messages API rejects
 * `temperature > 1` outright — a 400, the same "hard reject, not a clamp"
 * shape `pack-openai/catalogue.ts` found live for its own fixed-temperature
 * models. `clampTemperature` in `wire.ts` is what actually enforces this on
 * the way out; this constant is just where the number a card author might
 * reasonably want to compare against lives.
 */
export const MAX_TEMPERATURE = 1;

export const anthropicCartridges: CartridgeDefinition[] = [
	{
		id: 'anthropic/quick-claude',
		providerId: ANTHROPIC_PROVIDER_ID,
		model: MODELS.quick,
		displayName: 'Quick Claude',
		blurb: 'Fast and cheerful; great for first builds.',
		stats: { words: 2, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: 1, maxTokens: 800 }
	},
	{
		id: 'anthropic/deep-claude',
		providerId: ANTHROPIC_PROVIDER_ID,
		model: MODELS.deep,
		displayName: 'Deep Claude',
		blurb: 'Slower, but plans ahead.',
		stats: { words: 3, reasoning: 3, speed: 1 },
		costHint: 'high',
		defaults: { temperature: 1, maxTokens: 1500 }
	},
	{
		id: 'anthropic/penny-claude',
		providerId: ANTHROPIC_PROVIDER_ID,
		model: MODELS.penny,
		displayName: 'Penny Claude',
		blurb: 'Tiny and thrifty; watch it struggle with hard goals!',
		stats: { words: 1, reasoning: 1, speed: 3 },
		costHint: 'low',
		defaults: { temperature: 1, maxTokens: 600 }
	}
];

/** Where a user manages their keys — linked from the battery compartment (06 §6). */
export const ANTHROPIC_KEYS_URL = 'https://console.anthropic.com/settings/keys';
