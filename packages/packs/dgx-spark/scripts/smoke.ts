/**
 * Live smoke test against the two DGX Sparks (`99-DGX-SPARK.md` §8). **Never
 * runs in CI**: it needs the builder's own network.
 *
 *     npm run smoke:spark
 *
 * It checks three things:
 * - what each unit is serving;
 * - one streamed chat through the provider;
 * - one classification through the line.
 */
import {
	SPARK_MODELS,
	classifyOnSpark,
	createSparkProvider,
	createSparkTransport,
	sparkBaseUrls
} from '../dist/index.js';

async function main(): Promise<number> {
	const transport = createSparkTransport({ baseUrls: sparkBaseUrls(), fetch: globalThis.fetch });
	for (const unit of await transport.survey()) {
		console.log(
			`${unit.baseUrl}: ${unit.models === 'unreachable' ? 'unreachable' : unit.models.map((m) => `${m.id} (${m.root ?? '?'})`).join(', ')}`
		);
	}
	const provider = createSparkProvider();
	const t0 = performance.now();
	try {
		const reply = await provider.chat(
			{
				model: SPARK_MODELS.giant,
				messages: [{ role: 'user', content: 'Say hello in five words.' }],
				temperature: 0,
				maxTokens: 40
			},
			{ signal: new AbortController().signal }
		);
		console.log(
			`✓ chat in ${Math.round(performance.now() - t0)} ms: ${JSON.stringify(reply.text)}`
		);
	} catch (error) {
		console.error(`✗ chat: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}
	const t1 = performance.now();
	const result = await classifyOnSpark(
		{
			model: SPARK_MODELS.giant,
			state: { utterance: "I've been let go and I'm worried about my payments." },
			questions: {
				need: {
					type: 'choice',
					instructions: 'Which support need, if any, does the caller disclose?',
					criteria: {
						'job-loss': 'Lost their job',
						bereavement: 'Someone died',
						health: 'Health',
						none: 'None'
					}
				},
				urgent: { type: 'noul', instructions: 'Does the caller express worry?' }
			}
		},
		{ fetch: globalThis.fetch }
	);
	if (!result.ok) {
		console.error(`✗ classify: ${result.output}`);
		return 1;
	}
	console.log(`✓ classify in ${Math.round(performance.now() - t1)} ms: ${result.output}`);
	return 0;
}

main().then((code) => {
	process.exitCode = code;
});
