import { describe, expect, it } from 'vitest';
import { SPARK_MODELS } from './catalogue.js';
import {
	choiceConfidence,
	classifyOnSpark,
	distributionOver,
	optionsOf,
	sparkClassifierLine
} from './classifier.js';
import { SPARK_EGRESS, describeSparkEndpoint, sparkBaseUrls } from './endpoints.js';
import dgxSparkPack from './index.js';
import { createSparkProvider } from './provider.js';
import { createSparkTransport, servesModel } from './transport.js';

/**
 * **The DGX Spark pack** (`99-DGX-SPARK.md` §8), offline: a fake `fetch`
 * plays the two units. It covers:
 * - the endpoint rule;
 * - model routing by directory, and failover when a unit is down, loading
 *   or in another mode;
 * - the provider's wire (thinking off, streamed, errors in the Spark's own
 *   words);
 * - the classifier's folding of first-token log-probabilities onto the
 *   options, and Jev's confidence formula.
 */
const UNIT1 = 'http://spark-619c:8000/v1';
const UNIT2 = 'http://spark-ef08:8000/v1';
const GIANT = { id: 'puzzle-llm', root: '/models/Qwen3.5-122B-A10B-NVFP4', max_model_len: 40960 };
const QUICK = { id: 'qwen3.6', root: '/models/Qwen3.6-35B-A3B-NVFP4', max_model_len: 262144 };

interface Seen {
	url: string;
	body?: Record<string, unknown>;
}

/** Two units: each serves a list of models, or is down; completions answer with `reply`. */
function fakeSparks(
	units: Record<string, (typeof GIANT)[] | 'down' | 503>,
	reply: (url: string, body: Record<string, unknown>) => Response
) {
	const seen: Seen[] = [];
	const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = String(input);
		const base = Object.keys(units).find((b) => url.startsWith(b));
		const state = base ? units[base] : 'down';
		const body = init?.body
			? (JSON.parse(String(init.body)) as Record<string, unknown>)
			: undefined;
		seen.push({ url, ...(body ? { body } : {}) });
		if (state === 'down' || state === undefined) throw new TypeError('fetch failed');
		if (state === 503) return new Response('loading', { status: 503 });
		if (url.endsWith('/models')) return Response.json({ data: state });
		return reply(url, body ?? {});
	}) as typeof globalThis.fetch;
	return { fetch, seen };
}

const sse = (...chunks: unknown[]) =>
	new Response(
		`${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`,
		{ headers: { 'content-type': 'text/event-stream' } }
	);

describe('the endpoints', () => {
	it('declares the two units’ four hosts and nothing else', () => {
		expect(SPARK_EGRESS.map((e) => e.host).sort()).toEqual(
			['100.103.182.73', '100.119.19.90', 'spark-619c', 'spark-ef08'].sort()
		);
		expect(describeSparkEndpoint('http://spark-ef08:8000/v1')).toBeUndefined();
		expect(describeSparkEndpoint('100.119.19.90')).toBeUndefined();
		expect(describeSparkEndpoint('http://example.com/v1')).toMatch(/Only the two DGX Sparks/);
	});

	it('puts a preferred unit first and keeps the others as fallbacks', () => {
		expect(sparkBaseUrls()[0]).toBe(UNIT1);
		const order = sparkBaseUrls('spark-ef08');
		expect(order[0]).toBe(UNIT2);
		expect(order).toHaveLength(4);
	});
});

describe('the transport', () => {
	it('routes by model directory or served name, whatever the mode calls it', async () => {
		expect(servesModel(GIANT, 'puzzle-llm')).toBe(true);
		expect(servesModel(GIANT, SPARK_MODELS.giant)).toBe(true);
		expect(servesModel(GIANT, SPARK_MODELS.quick)).toBe(false);
		const { fetch } = fakeSparks({ [UNIT1]: [QUICK], [UNIT2]: [GIANT] }, () => new Response());
		const transport = createSparkTransport({ baseUrls: [UNIT1, UNIT2], fetch });
		expect(await transport.route(SPARK_MODELS.giant)).toMatchObject({
			baseUrl: UNIT2,
			model: { id: 'puzzle-llm' }
		});
	});

	it('fails over past a unit that is down or loading, and says what each unit serves when none will do', async () => {
		const { fetch, seen } = fakeSparks({ [UNIT1]: 'down', [UNIT2]: [GIANT] }, () =>
			Response.json({ ok: true })
		);
		const transport = createSparkTransport({ baseUrls: [UNIT1, UNIT2], fetch });
		const { route } = await transport.post(SPARK_MODELS.giant, '/chat/completions', (model) => ({
			model
		}));
		expect(route.baseUrl).toBe(UNIT2);
		expect(seen.at(-1)?.body).toEqual({ model: 'puzzle-llm' });

		const loading = fakeSparks({ [UNIT1]: 503, [UNIT2]: [QUICK] }, () => new Response());
		const none = createSparkTransport({ baseUrls: [UNIT1, UNIT2], fetch: loading.fetch });
		await expect(none.route(SPARK_MODELS.giant)).rejects.toThrow(
			/No DGX Spark is serving "Qwen3.5-122B-A10B-NVFP4".*spark-619c:8000\/v1: unreachable.*serving qwen3\.6.*spark-mode\.sh/
		);
	});
});

describe('the provider', () => {
	it('streams a chat from whichever unit serves the model, with thinking off', async () => {
		const { fetch, seen } = fakeSparks({ [UNIT1]: [GIANT] }, () =>
			sse(
				{ choices: [{ delta: { content: 'Hello ' } }] },
				{ choices: [{ delta: { content: 'there.' }, finish_reason: 'stop' }] },
				{ choices: [], usage: { prompt_tokens: 9, completion_tokens: 3 } }
			)
		);
		const provider = createSparkProvider({ fetch });
		const tokens: string[] = [];
		const reply = await provider.chat(
			{
				model: SPARK_MODELS.giant,
				messages: [{ role: 'user', content: 'hi' }],
				temperature: 0,
				maxTokens: 20
			},
			{ signal: new AbortController().signal, onToken: (t) => tokens.push(t) }
		);
		expect(reply.text).toBe('Hello there.');
		expect(tokens.join('')).toBe('Hello there.');
		const sent = seen.find((s) => s.url.endsWith('/chat/completions'))!.body!;
		expect(sent).toMatchObject({
			model: 'puzzle-llm',
			stream: true,
			chat_template_kwargs: { enable_thinking: false }
		});
		expect(provider.keyRequirement).toBe('none');
	});

	it('tells a recording which unit answered, and says nothing to a caller that did not ask', async () => {
		const { fetch } = fakeSparks({ [UNIT1]: 'down', [UNIT2]: [GIANT] }, () =>
			sse(
				{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
				{ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }
			)
		);
		const provider = createSparkProvider({ fetch });
		const request = {
			model: SPARK_MODELS.giant,
			messages: [{ role: 'user' as const, content: 'hi' }],
			temperature: 0,
			maxTokens: 8
		};
		const served: string[] = [];
		await provider.chat(request, {
			signal: new AbortController().signal,
			onServed: (unit) => served.push(unit)
		});
		expect(served).toEqual(['spark-ef08']);
		await expect(
			provider.chat(request, { signal: new AbortController().signal })
		).resolves.toBeDefined();
	});

	it('sends a seed only when the request carries one, and pins to one unit when asked (WP192)', async () => {
		const { fetch, seen } = fakeSparks({ [UNIT1]: [GIANT], [UNIT2]: [GIANT] }, () =>
			sse(
				{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] },
				{ choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } }
			)
		);
		const request = {
			model: SPARK_MODELS.giant,
			messages: [{ role: 'user' as const, content: 'hi' }],
			temperature: 0,
			maxTokens: 8
		};
		const signal = new AbortController().signal;
		const bodies = () =>
			seen.filter((s) => s.url.endsWith('/chat/completions')).map((s) => s.body!);
		await createSparkProvider({ fetch }).chat(request, { signal });
		expect('seed' in bodies()[0]!).toBe(false);
		await createSparkProvider({ fetch }).chat({ ...request, seed: 7 }, { signal });
		expect(bodies()[1]).toMatchObject({ seed: 7 });
		// Pinned to the second unit, every request goes there, whatever the load.
		const pinned = createSparkProvider({ fetch, pin: 'spark-ef08' });
		for (let i = 0; i < 3; i += 1) await pinned.chat(request, { signal });
		const sentTo = seen.filter((s) => s.url.endsWith('/chat/completions')).slice(2);
		expect(sentTo).toHaveLength(3);
		expect(sentTo.every((s) => s.url.startsWith(UNIT2))).toBe(true);
	});

	it('names the units and the switch command when nothing serves the cartridge', async () => {
		const { fetch } = fakeSparks({ [UNIT1]: [QUICK], [UNIT2]: 'down' }, () => new Response());
		const provider = createSparkProvider({ fetch });
		await expect(
			provider.chat(
				{ model: SPARK_MODELS.giant, messages: [], temperature: 0, maxTokens: 5 },
				{ signal: new AbortController().signal }
			)
		).rejects.toMatchObject({
			kind: 'provider-down',
			message: expect.stringMatching(/spark-mode/)
		});
		expect((await provider.validateKey('')).message).toMatch(/spark-619c is serving qwen3\.6/);
	});

	it('is registered keyless, with its cartridges and the classifier line', () => {
		expect(dgxSparkPack.providers?.[0]).toMatchObject({ id: 'dgx-spark', keyRequirement: 'none' });
		expect(dgxSparkPack.cartridges?.map((c) => c.model)).toEqual(Object.values(SPARK_MODELS));
		expect(dgxSparkPack.serviceLines?.[0]?.id).toBe('dgx-spark/classifier');
	});
});

describe('the classifier', () => {
	it('folds first-token log-probabilities onto the options they begin', () => {
		const top = [
			{ token: 'disc', logprob: Math.log(0.5) },
			{ token: 'd', logprob: Math.log(0.1) },
			{ token: 'bere', logprob: Math.log(0.3) },
			{ token: '"', logprob: Math.log(0.05) },
			{ token: 'c', logprob: Math.log(0.05) }
		];
		const { probabilities, covered, ambiguous } = distributionOver(
			['address', 'card', 'bereavement', 'disclosure'],
			top
		);
		expect(probabilities['disclosure']).toBeCloseTo(0.6 / 0.95);
		expect(probabilities['bereavement']).toBeCloseTo(0.3 / 0.95);
		expect(probabilities['card']).toBeCloseTo(0.05 / 0.95);
		expect(probabilities['address']).toBe(0);
		expect(covered).toBeCloseTo(0.95);
		expect(ambiguous).toBe(0);
		// A token that begins two options splits between them.
		const split = distributionOver(['job-loss', 'joy'], [{ token: 'jo', logprob: 0 }]);
		expect(split.probabilities).toEqual({ 'job-loss': 0.5, joy: 0.5 });
		expect(split.ambiguous).toBe(1);
	});

	it('uses Jev’s confidence formula: 0 when flat, 1 when certain', () => {
		expect(choiceConfidence({ a: 1, b: 0, c: 0 })).toBe(1);
		expect(choiceConfidence({ a: 1 / 3, b: 1 / 3, c: 1 / 3 })).toBeCloseTo(0);
		expect(choiceConfidence({ a: 0.9, b: 0.06, c: 0.04 })).toBeCloseTo((3 * 0.9 - 1) / 2);
	});

	it('answers choice, noul and score in Jev’s shape, constrained to the options', async () => {
		const bodies: Record<string, unknown>[] = [];
		const { fetch } = fakeSparks({ [UNIT1]: [GIANT] }, (_url, body) => {
			bodies.push(body);
			const keys = (body['structured_outputs'] as { choice: string[] }).choice;
			const first = keys[0]!;
			return Response.json({
				choices: [
					{
						message: { content: first },
						logprobs: {
							content: [
								{
									top_logprobs: [
										{ token: first, logprob: Math.log(0.8) },
										{ token: keys[1]!, logprob: Math.log(0.2) }
									]
								}
							]
						}
					}
				],
				usage: { prompt_tokens: 100, completion_tokens: 2 }
			});
		});
		const result = await classifyOnSpark(
			{
				model: SPARK_MODELS.giant,
				state: { utterance: 'My card was stolen.' },
				questions: {
					category: {
						type: 'choice',
						instructions: 'Which?',
						criteria: { card: 'A card', address: 'An address' }
					},
					steer: {
						type: 'noul',
						instructions: 'Steered?',
						criteria: { true: 'Yes it is', false: 'No' }
					},
					tone: { type: 'score', instructions: 'How calm?', criteria: ['calm', 'upset', 'angry'] }
				}
			},
			{ fetch }
		);
		expect(result.ok).toBe(true);
		const data = result.data as {
			model: string;
			answers: Record<string, Record<string, unknown>>;
			usage: { input_tokens: number };
			spark: { unit: string; servedAs: string };
		};
		expect(data.model).toBe('Qwen3.5-122B-A10B-NVFP4');
		expect(data.spark).toMatchObject({ unit: 'spark-619c', servedAs: 'puzzle-llm' });
		expect(data.usage.input_tokens).toBe(300);
		expect(data.answers['category']).toMatchObject({ type: 'choice', choice: 'card' });
		expect(data.answers['category']!['confidence']).toBeCloseTo(0.6);
		expect(data.answers['steer']).toEqual({ type: 'noul', noul: expect.closeTo(0.8) });
		expect(data.answers['tone']).toMatchObject({ type: 'score', score: expect.closeTo(0.2) });
		expect(bodies[1]).toMatchObject({
			temperature: 0,
			seed: 1,
			logprobs: true,
			structured_outputs: { choice: ['yes', 'no'] },
			chat_template_kwargs: { enable_thinking: false }
		});
		expect(optionsOf({ type: 'noul', instructions: 'x' })).toEqual({ yes: 'Yes.', no: 'No.' });
	});

	it('fails plainly, never with the transport’s words, and replays only from its cassette', async () => {
		const { fetch } = fakeSparks({ [UNIT1]: 'down', [UNIT2]: 'down' }, () => new Response());
		const result = await classifyOnSpark(
			{ model: 'nope', state: 'x', questions: { q: { type: 'noul', instructions: 'y' } } },
			{ fetch }
		);
		expect(result).toMatchObject({
			ok: false,
			output: expect.stringMatching(/No DGX Spark is serving "nope"/)
		});
		expect(sparkClassifierLine.live?.egress).toBe(SPARK_EGRESS);
		expect(sparkClassifierLine.cassette?.lineId).toBe('dgx-spark/classifier');
	});
});
