import type { LLMProvider, PackManifest } from '@craftabot/core';
import { SPARK_PROVIDER_ID, sparkCartridges } from './catalogue.js';
import { sparkClassifierLine } from './classifier.js';
import { SPARK_EGRESS, isSparkEndpoint } from './endpoints.js';
import { createSparkProvider } from './provider.js';

/**
 * **@craftabot/pack-dgx-spark** (`99-DGX-SPARK.md`): the builder's own two
 * NVIDIA DGX Sparks, as two kinds of content:
 * - **a provider**, so any Craft A Bot agent's LLM brick can run on them.
 *   It is keyless, like Ollama, and fails over between the units.
 * - **a classifier line**, which answers the same typed-question contract as
 *   Jev, so a local LLM can stand in for Jev and be compared with it.
 *
 * The four hosts in `endpoints.ts` are the pack's whole egress.
 */
function withEgress(provider: LLMProvider): LLMProvider {
	return { ...provider, egress: SPARK_EGRESS };
}

export const dgxSparkPack: PackManifest = {
	id: 'dgx-spark',
	name: 'DGX Spark (your own hardware)',
	version: '0.1.0',
	requiresCore: '>=1.0.0',
	cartridges: sparkCartridges,
	providers: [
		{
			id: SPARK_PROVIDER_ID,
			name: 'DGX Spark',
			keyRequirement: 'none',
			egress: SPARK_EGRESS,
			// A host's endpoint picks the preferred unit, and is honoured only when it names one of the two.
			create: ({ fetch, endpoint }) =>
				withEgress(
					createSparkProvider({
						...(fetch ? { fetch } : {}),
						...(endpoint !== undefined && isSparkEndpoint(endpoint) ? { endpoint } : {})
					})
				)
		}
	],
	serviceLines: [sparkClassifierLine]
};

export default dgxSparkPack;

export { SPARK_MODELS, SPARK_PROVIDER_ID, sparkCartridges } from './catalogue.js';
export {
	SPARK_CLASSIFIER_LINE_ID,
	SPARK_CLASSIFIER_OPERATION,
	choiceConfidence,
	classifyOnSpark,
	distributionOver,
	optionsOf,
	sparkClassifierLine,
	type ClassifierQuestion,
	type ClassifierRequest
} from './classifier.js';
export {
	SPARK_EGRESS,
	SPARK_PORT,
	SPARK_UNITS,
	baseUrlOf,
	describeSparkEndpoint,
	isSparkEndpoint,
	sparkBaseUrls,
	type SparkUnit
} from './endpoints.js';
export {
	SPARK_EXTRA_BODY,
	SparkError,
	createSparkProvider,
	type SparkProviderOptions
} from './provider.js';
export {
	SparkUnavailable,
	createSparkTransport,
	servesModel,
	type ServedModel,
	type SparkRoute,
	type SparkTransport
} from './transport.js';
