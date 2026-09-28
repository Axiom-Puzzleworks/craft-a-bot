import type { CartridgeDefinition } from '@craftabot/core';

/**
 * **The Spark cartridges** (`99-DGX-SPARK.md` §5). A cartridge names a
 * *model directory* on the Sparks, not a served name. The transport finds
 * whichever unit's current mode serves that model, under whatever name the
 * mode gives it. The three below are the language models the modes serve
 * (`MODES.md` in the Spark project folder). Only a unit whose mode serves
 * the model can answer. Otherwise the error names what each unit is
 * serving and the command to switch.
 */
export const SPARK_PROVIDER_ID = 'dgx-spark';

export const SPARK_MODELS = {
	/** Qwen3.5-122B-A10B (NVFP4): modes `puzzle` (as `puzzle-llm`, `tidy`) and `lang-single` (as `qwen3.5-122b`). */
	giant: 'Qwen3.5-122B-A10B-NVFP4',
	/** Qwen3.6-35B-A3B (NVFP4): mode `chat` (as `qwen3.6`). */
	quick: 'Qwen3.6-35B-A3B-NVFP4',
	/** Qwen3.6-27B dense (NVFP4): mode `coder-27b` (as `qwen3.6-27b`). */
	coder: 'Qwen3.6-27B-NVFP4'
} as const;

export const sparkCartridges: CartridgeDefinition[] = [
	{
		id: 'dgx-spark/giant-qwen',
		providerId: SPARK_PROVIDER_ID,
		model: SPARK_MODELS.giant,
		displayName: 'Spark Giant',
		blurb: 'The biggest brain on your own Sparks — 122 billion parameters, never leaves the house.',
		stats: { words: 3, reasoning: 3, speed: 1 },
		costHint: 'low',
		defaults: { temperature: 0.7, maxTokens: 1500 }
	},
	{
		id: 'dgx-spark/quick-qwen',
		providerId: SPARK_PROVIDER_ID,
		model: SPARK_MODELS.quick,
		displayName: 'Spark Sprinter',
		blurb: 'Fast on your own Sparks — five times quicker, nearly as clever.',
		stats: { words: 3, reasoning: 2, speed: 3 },
		costHint: 'low',
		defaults: { temperature: 0.7, maxTokens: 1000 }
	},
	{
		id: 'dgx-spark/coder-qwen',
		providerId: SPARK_PROVIDER_ID,
		model: SPARK_MODELS.coder,
		displayName: 'Spark Tinkerer',
		blurb: 'The coding model on your own Sparks — careful with tools.',
		stats: { words: 2, reasoning: 3, speed: 2 },
		costHint: 'low',
		defaults: { temperature: 0.4, maxTokens: 1200 }
	}
];
