import { describe, expect, it } from 'vitest';
import { CHAT_REQUEST } from './test-wire.js';
import { buildRequestBody } from './wire.js';

describe('the system prompt', () => {
	it('is pulled out of messages into systemInstruction', () => {
		const body = buildRequestBody(CHAT_REQUEST);
		expect(body['systemInstruction']).toEqual({
			parts: [{ text: 'You are a small robot in a simulated playroom.' }]
		});
		const contents = body['contents'] as Array<Record<string, unknown>>;
		expect(contents.every((message) => message['role'] !== 'system')).toBe(true);
	});

	it('is omitted entirely when there is none', () => {
		const body = buildRequestBody({
			...CHAT_REQUEST,
			messages: [{ role: 'user', content: 'hello' }]
		});
		expect('systemInstruction' in body).toBe(false);
	});
});

describe('temperature — Gemini accepts the full 0-2 range, unlike Anthropic', () => {
	it('sends the value unclamped', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, temperature: 1.9 });
		expect((body['generationConfig'] as Record<string, unknown>)['temperature']).toBe(1.9);
	});
});

describe('roles translated to user/model', () => {
	it('turns an assistant message into role: model', () => {
		const body = buildRequestBody({
			...CHAT_REQUEST,
			messages: [{ role: 'assistant', content: 'Just thinking.' }]
		});
		const contents = body['contents'] as Array<Record<string, unknown>>;
		expect(contents[0]).toEqual({ role: 'model', parts: [{ text: 'Just thinking.' }] });
	});

	it('turns a user message into role: user', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, messages: [{ role: 'user', content: 'hi' }] });
		const contents = body['contents'] as Array<Record<string, unknown>>;
		expect(contents[0]).toEqual({ role: 'user', parts: [{ text: 'hi' }] });
	});
});

/**
 * **Matched by name, not an id** (E7 / `12-…` D12's transcript strategy
 * meets a provider with no call/result id concept at all).
 */
describe('the tool-call protocol translated into functionCall/functionResponse', () => {
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

	it('turns an assistant tool call into text + functionCall parts', () => {
		const contents = buildRequestBody(withCalls)['contents'] as Array<Record<string, unknown>>;
		expect(contents[0]).toEqual({
			role: 'model',
			parts: [
				{ text: 'Going east.' },
				{ functionCall: { name: 'move', args: { direction: 'east' } } }
			]
		});
	});

	it('turns a tool result into a user turn carrying a functionResponse part, matched by name', () => {
		const contents = buildRequestBody(withCalls)['contents'] as Array<Record<string, unknown>>;
		expect(contents[1]).toEqual({
			role: 'user',
			parts: [{ functionResponse: { name: 'move', response: { content: 'You moved east.' } } }]
		});
	});

	it('omits the text part when the assistant said nothing before calling', () => {
		const silent = {
			...CHAT_REQUEST,
			messages: [
				{
					role: 'assistant' as const,
					content: '',
					toolCalls: [{ id: 'call_2', name: 'move', arguments: {} }]
				}
			]
		};
		const contents = buildRequestBody(silent)['contents'] as Array<Record<string, unknown>>;
		expect(contents[0]?.['parts']).toEqual([{ functionCall: { name: 'move', args: {} } }]);
	});
});

describe('tools', () => {
	it('translates to a functionDeclarations wrapper', () => {
		const body = buildRequestBody(CHAT_REQUEST);
		expect(body['tools']).toEqual([
			{
				functionDeclarations: [
					{
						name: 'move',
						description: 'Roll one square.',
						parameters: { type: 'object', properties: { direction: { type: 'string' } } }
					}
				]
			}
		]);
	});

	it('is omitted when there are none', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, tools: [] });
		expect('tools' in body).toBe(false);
	});
});

describe('generationConfig', () => {
	it('carries temperature and maxOutputTokens', () => {
		const body = buildRequestBody(CHAT_REQUEST);
		expect(body['generationConfig']).toEqual({
			temperature: CHAT_REQUEST.temperature,
			maxOutputTokens: CHAT_REQUEST.maxTokens
		});
	});
});
