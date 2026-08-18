import type { CartridgeDefinition } from '@craftabot/core';

/** **The one place Gemini model ids appear** (`06-…` §4's discipline, carried over again). */

export const GEMINI_PROVIDER_ID = 'gemini';

/** Fixed constant — the UI never builds this from user input (06 §5). */
export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Real Gemini tiers, same shape as Anthropic's: Flash-Lite, Flash and Pro are
 * genuinely different models, not one model tuned three ways.
 */
export const MODELS = {
	quick: 'gemini-2.5-flash',
	deep: 'gemini-2.5-pro',
	penny: 'gemini-2.5-flash-lite'
} as const;

export const geminiCartridges: CartridgeDefinition[] = [
	{
		id: 'gemini/quick-gemini',
		providerId: GEMINI_PROVIDER_ID,
		model: MODELS.quick,
		displayName: 'Quick Gemini',
		blurb: 'Fast and cheerful; great for first builds.',
		stats: { words: 2, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: 1, maxTokens: 800 }
	},
	{
		id: 'gemini/deep-gemini',
		providerId: GEMINI_PROVIDER_ID,
		model: MODELS.deep,
		displayName: 'Deep Gemini',
		blurb: 'Slower, but plans ahead.',
		stats: { words: 3, reasoning: 3, speed: 1 },
		costHint: 'high',
		defaults: { temperature: 1, maxTokens: 1500 }
	},
	{
		id: 'gemini/penny-gemini',
		providerId: GEMINI_PROVIDER_ID,
		model: MODELS.penny,
		displayName: 'Penny Gemini',
		blurb: 'Tiny and thrifty; watch it struggle with hard goals!',
		stats: { words: 1, reasoning: 1, speed: 3 },
		costHint: 'low',
		defaults: { temperature: 1, maxTokens: 600 }
	}
];

/** Where a user manages their keys — linked from the battery compartment (06 §6). */
export const GEMINI_KEYS_URL = 'https://aistudio.google.com/apikey';
