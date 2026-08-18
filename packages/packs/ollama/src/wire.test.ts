import { describe, expect, it } from 'vitest';
import { MODELS, ollamaCartridges } from './catalogue.js';
import { CHAT_REQUEST } from './test-wire.js';
import { buildRequestBody } from './wire.js';

/**
 * Unlike `pack-openai/wire.test.ts`'s regression suite for the GPT-5
 * family's temperature/reasoning constraints, the whole point here is that
 * none of that applies — every cartridge's dial reaches the wire as sent.
 */
describe('temperature and tokens reach the wire unmodified', () => {
	it('sends temperature for every cartridge in the catalogue, with no per-model carve-out', () => {
		for (const cartridge of ollamaCartridges) {
			const body = buildRequestBody({ ...CHAT_REQUEST, temperature: 0.9 }, cartridge.model);
			expect(`${cartridge.id}: ${body['temperature']}`).toBe(`${cartridge.id}: 0.9`);
		}
	});

	it('sends max_tokens as given', () => {
		const body = buildRequestBody(CHAT_REQUEST, MODELS.quick);
		expect(body['max_tokens']).toBe(CHAT_REQUEST.maxTokens);
	});

	it('sets stream: true and the model id', () => {
		const body = buildRequestBody(CHAT_REQUEST, MODELS.deep);
		expect(body['stream']).toBe(true);
		expect(body['model']).toBe(MODELS.deep);
	});
});

/**
 * **The assistant half of the tool protocol** (E7 / `12-…` D12) — identical
 * translation to `pack-openai`'s, because the wire shape genuinely is.
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
		const messages = buildRequestBody(withCalls, MODELS.quick)['messages'] as Array<
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
		const messages = buildRequestBody(CHAT_REQUEST, MODELS.quick)['messages'] as Array<
			Record<string, unknown>
		>;
		expect(messages.some((message) => 'tool_calls' in message)).toBe(false);
	});
});

describe('tools', () => {
	it('translates to OpenAI-shaped function definitions', () => {
		const body = buildRequestBody(CHAT_REQUEST, MODELS.quick);
		expect(body['tools']).toEqual([
			{
				type: 'function',
				function: {
					name: 'move',
					description: 'Roll one square.',
					parameters: { type: 'object', properties: { direction: { type: 'string' } } }
				}
			}
		]);
	});
});
