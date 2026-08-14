import { describe, expect, it } from 'vitest';
import { MODELS, openAiCartridges } from './catalogue.js';
import { CHAT_REQUEST } from './test-wire.js';
import { buildRequestBody } from './wire.js';

/**
 * Regression: the GPT-5 family returns a hard 400 if `temperature` is sent at
 * all, whatever its value. Every canned fixture accepted it, so only the live
 * smoke test caught it — these tests are what stop it coming back.
 */
describe('temperature, which the GPT-5 family refuses', () => {
	it('omits the parameter entirely for a fixed-temperature model', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, temperature: 0.7 }, MODELS.quickThinker);
		expect('temperature' in body).toBe(false);
	});

	it('omits it for every model in the catalogue, since all three are GPT-5', () => {
		for (const cartridge of openAiCartridges) {
			const body = buildRequestBody({ ...CHAT_REQUEST, temperature: 0.7 }, cartridge.model);
			expect(`${cartridge.model}: ${'temperature' in body}`).toBe(`${cartridge.model}: false`);
		}
	});

	it('still sends it for a model that accepts one', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, temperature: 0.3 }, 'gpt-4o-mini');
		expect(body['temperature']).toBe(0.3);
	});

	it('leaves the rest of the body alone', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, temperature: 0.7 }, MODELS.quickThinker);
		expect(body['model']).toBe(MODELS.quickThinker);
		expect(body['stream']).toBe(true);
		expect(body['max_completion_tokens']).toBe(CHAT_REQUEST.maxTokens);
	});
});

/**
 * Reasoning effort. Left unset, GPT-5 spends most of `max_completion_tokens`
 * on hidden reasoning — measured live at 384 tokens to say hello — and a small
 * budget then returns an empty completion with `finish_reason: length`.
 */
describe('reasoning effort', () => {
	it('sends the effort mapped to each cartridge', () => {
		const effortFor = (model: string) => buildRequestBody(CHAT_REQUEST, model)['reasoning_effort'];
		expect(effortFor(MODELS.pennyThinker)).toBe('minimal');
		expect(effortFor(MODELS.quickThinker)).toBe('low');
		expect(effortFor(MODELS.deepThinker)).toBe('medium');
	});

	it('orders effort by the reasoning stat the cartridge advertises', () => {
		const rank = { minimal: 0, low: 1, medium: 2, high: 3 };
		const byStat = [...openAiCartridges].sort((a, b) => a.stats.reasoning - b.stats.reasoning);
		const efforts = byStat.map(
			(cartridge) =>
				rank[
					buildRequestBody(CHAT_REQUEST, cartridge.model)['reasoning_effort'] as keyof typeof rank
				]
		);
		// The label on the box has to match what the cartridge actually does.
		expect(efforts).toStrictEqual([...efforts].sort((a, b) => a - b));
		expect(new Set(efforts).size).toBe(byStat.length);
	});

	it('omits it for a model that is not a reasoning model', () => {
		expect('reasoning_effort' in buildRequestBody(CHAT_REQUEST, 'gpt-4o-mini')).toBe(false);
	});

	it('gives every cartridge enough budget to reason and still speak', () => {
		// The old defaults (200-500) were below the measured reasoning cost alone.
		for (const cartridge of openAiCartridges) {
			expect(`${cartridge.id}: ${cartridge.defaults.maxTokens >= 400}`).toBe(
				`${cartridge.id}: true`
			);
		}
	});
});

/**
 * **The assistant half of the tool protocol** (E7 / `12-…` D12).
 *
 * `transcript-v1` composes `role:'tool'` messages, and OpenAI rejects one that
 * does not answer a preceding assistant turn carrying `tool_calls` — so a
 * transcript that is well-formed in our vocabulary and drops the calls here is
 * a 400 that no unit test upstream can see. The one place this shape is
 * genuinely provider-specific is the arguments: OpenAI wants a JSON *string*
 * inside `function`, not an object.
 */
describe('tool calls on an assistant message', () => {
	const withCalls = {
		...CHAT_REQUEST,
		messages: [
			{
				role: 'assistant' as const,
				content: 'Going east.',
				toolCalls: [{ id: 'call_1', name: 'move', arguments: { direction: 'east' } }]
			},
			{ role: 'tool' as const, content: 'You moved east.', toolCallId: 'call_1', name: 'move' }
		]
	};

	it('sends the call as a function object with stringified arguments', () => {
		const messages = buildRequestBody(withCalls, 'gpt-4o-mini')['messages'] as Array<
			Record<string, unknown>
		>;

		expect(messages[0]?.['tool_calls']).toStrictEqual([
			{
				id: 'call_1',
				type: 'function',
				function: { name: 'move', arguments: '{"direction":"east"}' }
			}
		]);
		expect(messages[1]?.['tool_call_id']).toBe('call_1');
	});

	it('omits the key entirely on every message that made no call', () => {
		const messages = buildRequestBody(CHAT_REQUEST, 'gpt-4o-mini')['messages'] as Array<
			Record<string, unknown>
		>;

		// A `sections-v1` request must go on the wire exactly as it always has.
		expect(messages.some((message) => 'tool_calls' in message)).toBe(false);
	});
});
