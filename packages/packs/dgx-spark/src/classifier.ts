import { parseCassetteFile, type ServiceLine, type ToolResult } from '@craftabot/core';
import recording from './cassettes/dgx-spark-classifier.craftabot-cassette.json' with { type: 'json' };
import { foldFirstToken } from '@craftabot/governance';
import { SPARK_EGRESS, sparkBaseUrls } from './endpoints.js';
import { SPARK_EXTRA_BODY } from './provider.js';
import { SparkUnavailable, createSparkTransport, type SparkTransport } from './transport.js';

/**
 * **The Spark as a classifier** (`99-DGX-SPARK.md` §6). A service line that
 * answers the same typed-question contract Jev does. It takes a state and
 * named `choice`, `noul` or `score` questions, and returns one answer per
 * question with a probability for every option and a confidence, in Jev's
 * wire shape (`98-JEV.md` §2–§3). A reader can then swap Jev for a local LLM
 * on the builder's own hardware, and the two can be compared row for row.
 *
 * **How an LLM gives a distribution.** Each question is one chat completion:
 * - The output is constrained to the option keys (vLLM's
 *   `structured_outputs.choice`).
 * - It is run at temperature 0 with a seed.
 * - It asks for the first token's top 20 log-probabilities. Under the
 *   constraint these are the model's probabilities over the options'
 *   possible first tokens (`card`, `c`, `car`, …).
 * - Each token's probability goes to the option(s) it begins, is split
 *   evenly if it begins more than one, and the total is normalised over the
 *   options.
 * - The confidence is Jev's own formula for a choice, taken from TypeSafe's
 *   documentation: `(n·p_max − 1)/(n − 1)`.
 *
 * So both readers' confidences mean the same thing. What differs is where
 * the probabilities come from: Jev is trained for calibration (RLCD), and
 * here they are a generative model's raw next-token probabilities.
 *
 * - A **noul** is a choice between `yes` and `no`, with the criteria as their
 *   descriptions. Its answer is P(yes).
 * - A **score** is a choice over the level indices `0`…`n−1`. Its answer is
 *   the probability-weighted index.
 *
 * Like every line it goes live only under `craftabot record`, with the
 * guard allowing the Sparks' four hosts. Sessions and workflows replay the
 * cassette.
 */
export const SPARK_CLASSIFIER_LINE_ID = 'dgx-spark/classifier';
export const SPARK_CLASSIFIER_OPERATION = 'system-one';

const SYSTEM_PROMPT =
	'You are a careful classifier. You are given a state (the material to judge) and one question with its options. Judge the state against the question and answer with exactly one option key.';
const TOP_LOGPROBS = 20;
const SEED = 1;

export interface ClassifierQuestion {
	type: 'choice' | 'noul' | 'score';
	instructions: unknown;
	criteria?: unknown;
}

export interface ClassifierRequest {
	/** A model directory (`Qwen3.5-122B-A10B-NVFP4`) or a served name; see `transport.ts`. */
	model: string;
	state: unknown;
	questions: Record<string, ClassifierQuestion>;
}

interface TopLogprob {
	token: string;
	logprob: number;
}

/** The options a question offers, with the description the model sees for each. */
export function optionsOf(question: ClassifierQuestion): Record<string, unknown> {
	if (question.type === 'choice') return (question.criteria ?? {}) as Record<string, unknown>;
	if (question.type === 'noul') {
		const criteria = (question.criteria ?? {}) as { true?: unknown; false?: unknown };
		return { yes: criteria.true ?? 'Yes.', no: criteria.false ?? 'No.' };
	}
	const levels = (question.criteria ?? []) as unknown[];
	return Object.fromEntries(levels.map((level, index) => [String(index), level]));
}

/**
 * The first token's log-probabilities folded onto the options: each token's
 * mass goes to the options it is a prefix of, split evenly between them, and
 * the result is normalised over the options. Since WP120 (`104-READERS.md`
 * §10.4) this is `governance`'s `foldFirstToken` — the LLM reader's own fold,
 * one definition for every chat model read as a classifier.
 */
export const distributionOver = foldFirstToken;

/** Jev's confidence for a choice, from its documentation: 0 when flat, 1 when certain. */
export function choiceConfidence(probabilities: Record<string, number>): number {
	const values = Object.values(probabilities);
	const n = values.length;
	if (n < 2) return 1;
	const peak = Math.max(...values);
	return Math.max(0, Math.min(1, (n * peak - 1) / (n - 1)));
}

/**
 * Six decimal places, the precision every probability and confidence is
 * kept to. Full doubles carry runs of 15–17 digits, and the synthetic sweep
 * (hard rule 9) reads some of those as card numbers. Six places is finer
 * than any threshold or bin the analysis uses. The first 1,224 recorded
 * answers were rounded the same way after recording (`99-DGX-SPARK.md` §4).
 */
export const round = (p: number): number => Number(p.toFixed(6));
const roundAll = (probabilities: Record<string, number>): Record<string, number> =>
	Object.fromEntries(Object.entries(probabilities).map(([key, p]) => [key, round(p)]));

const argmax = (probabilities: Record<string, number>, fallback: string): string =>
	Object.entries(probabilities).reduce((best, [option, p]) => (p > best[1] ? [option, p] : best), [
		fallback,
		-1
	] as [string, number])[0];

function isRequest(value: unknown): value is ClassifierRequest {
	const args = value as Partial<ClassifierRequest> | undefined;
	return (
		typeof args?.model === 'string' &&
		args.state !== undefined &&
		typeof args.questions === 'object' &&
		args.questions !== null &&
		Object.keys(args.questions).length > 0
	);
}

const transports = new WeakMap<typeof globalThis.fetch, SparkTransport>();
function transportFor(fetch: typeof globalThis.fetch): SparkTransport {
	let transport = transports.get(fetch);
	if (!transport) {
		transport = createSparkTransport({ baseUrls: sparkBaseUrls(), fetch });
		transports.set(fetch, transport);
	}
	return transport;
}

/** One question, one completion. */
async function askOne(
	transport: SparkTransport,
	request: ClassifierRequest,
	question: ClassifierQuestion,
	signal?: AbortSignal
) {
	const options = optionsOf(question);
	const keys = Object.keys(options);
	const { response, route } = await transport.post(
		request.model,
		'/chat/completions',
		(model) => ({
			model,
			temperature: 0,
			seed: SEED,
			max_tokens: 16,
			logprobs: true,
			top_logprobs: TOP_LOGPROBS,
			...SPARK_EXTRA_BODY,
			structured_outputs: { choice: keys },
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{
					role: 'user',
					content: JSON.stringify({
						state: request.state,
						question: question.instructions,
						options
					})
				}
			]
		}),
		signal
	);
	if (!response.ok) throw new Error(`The Spark answered ${response.status}.`);
	const body = (await response.json()) as {
		choices?: {
			message?: { content?: unknown };
			logprobs?: { content?: { top_logprobs?: TopLogprob[] }[] };
		}[];
		usage?: { prompt_tokens?: number; completion_tokens?: number };
	};
	const choice = body.choices?.[0];
	const said = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
	const top = choice?.logprobs?.content?.[0]?.top_logprobs ?? [];
	const folded = distributionOver(keys, top);
	return {
		keys,
		said,
		folded,
		route,
		usage: {
			input: body.usage?.prompt_tokens ?? 0,
			output: body.usage?.completion_tokens ?? 0
		}
	};
}

/**
 * Every question of a request, answered in Jev's shape. The extra `spark`
 * block names the unit, the served name and the model directory, and for
 * each question what was said, how much of the first token's mass landed on
 * the options, and how much was ambiguous between them.
 */
export async function classifyOnSpark(
	args: unknown,
	deps: { fetch: typeof globalThis.fetch; signal?: AbortSignal; transport?: SparkTransport }
): Promise<ToolResult> {
	if (!isRequest(args))
		return {
			ok: false,
			output: 'A classification needs a model, a state and at least one question.'
		};
	const transport = deps.transport ?? transportFor(deps.fetch);
	const answers: Record<string, unknown> = {};
	const diagnostics: Record<string, unknown> = {};
	let input = 0;
	let output = 0;
	let unit: string | undefined;
	let servedAs: string | undefined;
	let root: string | undefined;
	try {
		for (const [id, question] of Object.entries(args.questions)) {
			const asked = await askOne(transport, args, question, deps.signal);
			input += asked.usage.input;
			output += asked.usage.output;
			unit = new URL(asked.route.baseUrl).hostname;
			servedAs = asked.route.model.id;
			root = asked.route.model.root;
			const probabilities = roundAll(asked.folded.probabilities);
			const picked = argmax(
				probabilities,
				asked.keys.includes(asked.said) ? asked.said : asked.keys[0]!
			);
			diagnostics[id] = {
				said: asked.said,
				covered: Number(asked.folded.covered.toFixed(6)),
				ambiguous: Number(asked.folded.ambiguous.toFixed(6))
			};
			if (question.type === 'noul') {
				answers[id] = { type: 'noul', noul: probabilities['yes'] ?? 0 };
			} else if (question.type === 'score') {
				const score = asked.keys.reduce((sum, key) => sum + Number(key) * probabilities[key]!, 0);
				answers[id] = {
					type: 'score',
					score: round(score),
					legend: Object.fromEntries(
						asked.keys.map((key) => [key, String(optionsOf(question)[key])])
					),
					probabilities,
					confidence: round(choiceConfidence(probabilities))
				};
			} else {
				answers[id] = {
					type: 'choice',
					choice: picked,
					probabilities,
					confidence: round(choiceConfidence(probabilities))
				};
			}
		}
	} catch (cause) {
		if (cause instanceof SparkUnavailable) return { ok: false, output: cause.message };
		// Never the transport's own words (`47-…` §4.3).
		return { ok: false, output: 'The DGX Spark could not be reached.' };
	}
	const dir = root
		?.split('/')
		.filter((part) => part !== '')
		.at(-1);
	const data = {
		model: dir ?? servedAs ?? args.model,
		answers,
		usage: { input_tokens: input, output_tokens: output },
		spark: { unit, servedAs, diagnostics }
	};
	const summary = Object.entries(answers)
		.map(([id, answer]) => {
			const a = answer as { type: string; choice?: string; confidence?: number; noul?: number };
			return a.type === 'noul'
				? `${id}=${(a.noul ?? 0).toFixed(2)}`
				: `${id}=${a.choice ?? ''} (${(a.confidence ?? 0).toFixed(2)})`;
		})
		.join(', ');
	return { ok: true, output: summary, data };
}

export const sparkClassifierLine: ServiceLine = {
	id: SPARK_CLASSIFIER_LINE_ID,
	name: 'DGX Spark classifier',
	description:
		'A local LLM on the builder’s own DGX Sparks answering typed questions (choice, noul, score) with probabilities from its log-probabilities — the same contract as Jev. Recorded; harness-only for recording.',
	operations: [
		{
			id: SPARK_CLASSIFIER_OPERATION,
			name: 'Ask the Spark',
			description:
				'Evaluate a state against typed questions and return one typed answer per question, with probabilities and a confidence. Read-only.',
			parameters: {
				type: 'object',
				properties: {
					model: { type: 'string', description: 'A Spark model directory or served name.' },
					state: { description: 'The text or JSON to judge.' },
					questions: { type: 'object', description: 'Named typed questions.' }
				},
				required: ['model', 'state', 'questions']
			},
			riskTier: 'observe'
		}
	],
	cassette: parseCassetteFile(recording),
	live: {
		// vLLM answers CORS with `*` (probed 2026-09-28): a page served over http on the LAN could call it.
		browserCapable: true,
		egress: SPARK_EGRESS,
		async call(op, args, deps) {
			if (op !== SPARK_CLASSIFIER_OPERATION)
				return { ok: false, output: `The Spark classifier has no "${op}".` };
			return classifyOnSpark(args, deps);
		}
	}
};
