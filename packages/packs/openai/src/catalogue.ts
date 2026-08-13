import type { CartridgeDefinition } from '@craftabot/core';

/**
 * **The one place OpenAI model ids appear** (06-LLM-PROVIDERS.md §4).
 *
 * OpenAI renames and retires models often, so the doc is explicit that updating
 * them must be a one-file PR. Nothing outside this file may hard-code a model
 * id — `provider.ts` takes whatever the cartridge hands it.
 *
 * The three cartridges are chosen to teach "different brains behave
 * differently" without a wall of options, and Penny Thinker is deliberately
 * weak: watching a small model struggle with the locked-chest card is the point,
 * not a defect.
 */

export const OPENAI_PROVIDER_ID = 'openai';

/** Fixed constant — the UI never builds this from user input (06 §5). */
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const MODELS = {
	quickThinker: 'gpt-5-mini',
	deepThinker: 'gpt-5',
	pennyThinker: 'gpt-5-nano'
} as const;

/**
 * The GPT-5 family rejects any `temperature` other than the default:
 *
 *     Unsupported value: 'temperature' does not support 0.7 with this model.
 *     Only the default (1) value is supported.
 *
 * It is a hard 400, so sending the parameter fails the whole call. Found by the
 * live smoke test — every canned fixture accepted it happily, because fixtures
 * only ever reject what we thought to make them reject.
 *
 * Model *capabilities* belong beside model *ids* for the same reason the ids are
 * here: when OpenAI changes its mind, this stays a one-file PR (06 §4).
 */
const FIXED_TEMPERATURE_MODELS: ReadonlySet<string> = new Set<string>([
	MODELS.quickThinker,
	MODELS.deepThinker,
	MODELS.pennyThinker
]);

/** Whether a model accepts a caller-chosen temperature at all. */
export function supportsTemperature(model: string): boolean {
	return !FIXED_TEMPERATURE_MODELS.has(model);
}

/**
 * The temperature these models actually run at. The cartridge defaults below
 * are set to this rather than to a value we would like, so the workbench shows
 * the truth.
 */
export const FIXED_TEMPERATURE = 1;

/**
 * How hard each cartridge is allowed to think *invisibly*.
 *
 * The GPT-5 family is a reasoning family: left alone it spends output budget on
 * hidden reasoning before saying anything. Measured against the live API, "say
 * hello in under ten words" cost 384 reasoning tokens at the default setting —
 * and at `maxTokens: 300` (our old Quick Thinker default) the budget ran out
 * during reasoning and the model returned *nothing at all*.
 *
 * That is the wrong trade for this product twice over. Hidden reasoning is
 * invisible to the player, so it buys nothing a thought bubble can show; and it
 * makes the trace dishonest, reporting tokens spent on thinking nobody can
 * read (03 §9, hard rule 3).
 *
 * So each cartridge gets an explicit effort — mapped to the `reasoning` stat it
 * already advertises on its label, which makes that stat real rather than
 * decorative. Penny Thinker genuinely does not stop to think; Deep Thinker
 * genuinely does.
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

const REASONING_EFFORT: Readonly<Record<string, ReasoningEffort>> = {
	[MODELS.pennyThinker]: 'minimal', // reasoning stat 1
	[MODELS.quickThinker]: 'low', // reasoning stat 2
	[MODELS.deepThinker]: 'medium' // reasoning stat 3
};

/** The effort setting for a model, or undefined if it is not a reasoning model. */
export function reasoningEffortFor(model: string): ReasoningEffort | undefined {
	return REASONING_EFFORT[model];
}

export const openAiCartridges: CartridgeDefinition[] = [
	{
		id: 'openai/quick-thinker',
		providerId: OPENAI_PROVIDER_ID,
		model: MODELS.quickThinker,
		displayName: 'Quick Thinker',
		blurb: 'Fast and cheerful; great for first builds.',
		stats: { words: 2, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 800 }
	},
	{
		id: 'openai/deep-thinker',
		providerId: OPENAI_PROVIDER_ID,
		model: MODELS.deepThinker,
		displayName: 'Deep Thinker',
		blurb: 'Slower, but plans ahead.',
		stats: { words: 3, reasoning: 3, speed: 1 },
		costHint: 'high',
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 1500 }
	},
	{
		id: 'openai/penny-thinker',
		providerId: OPENAI_PROVIDER_ID,
		model: MODELS.pennyThinker,
		displayName: 'Penny Thinker',
		blurb: 'Tiny and thrifty; watch it struggle with hard goals!',
		stats: { words: 1, reasoning: 1, speed: 3 },
		costHint: 'low',
		/*
		 * 600, not 400 (C5, `12-…` §2).
		 *
		 * Even at `minimal` effort the reasoning spend is not zero, and 400 left
		 * so little headroom on the longer cards that the model returned an
		 * empty reply — which costs two completions and a whole turn to the
		 * malformed re-prompt, every time it happens. Penny Thinker is meant to
		 * struggle visibly with hard goals, which is quite different from
		 * silently running out of room to answer in.
		 *
		 * A per-cartridge *minimum* the bench dial cannot go below arrives with
		 * `14-…` §4.1 in WP14, where cartridge defaults become real.
		 */
		defaults: { temperature: FIXED_TEMPERATURE, maxTokens: 600 }
	}
];

/** Where a user manages their keys — linked from the battery compartment (06 §6). */
export const OPENAI_KEYS_URL = 'https://platform.openai.com/api-keys';
