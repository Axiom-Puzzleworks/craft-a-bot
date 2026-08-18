import { describe, expect, it } from 'vitest';
import { CHAT_REQUEST } from './test-wire.js';
import { buildRequestBody, clampTemperature } from './wire.js';

/**
 * `buildRequestBody`'s three real translation jobs — none of which OpenAI's
 * own wire format needs, all three named in `wire.ts`'s header comment.
 */

describe('the system prompt', () => {
	it('is pulled out of messages into the top-level field', () => {
		const body = buildRequestBody(CHAT_REQUEST, 'claude-sonnet-4-5');
		expect(body['system']).toBe('You are a small robot in a simulated playroom.');
		const messages = body['messages'] as Array<Record<string, unknown>>;
		expect(messages.every((message) => message['role'] !== 'system')).toBe(true);
	});

	it('is omitted entirely when there is none', () => {
		const body = buildRequestBody(
			{ ...CHAT_REQUEST, messages: [{ role: 'user', content: 'hello' }] },
			'claude-sonnet-4-5'
		);
		expect('system' in body).toBe(false);
	});
});

describe('temperature, which the live API 400s above 1', () => {
	it('clamps down to the maximum', () => {
		expect(clampTemperature(1.8)).toBe(1);
	});

	it('clamps up to zero, never negative', () => {
		expect(clampTemperature(-0.5)).toBe(0);
	});

	it('leaves an in-range value alone', () => {
		expect(clampTemperature(0.4)).toBe(0.4);
	});

	it('is what actually reaches the wire body', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, temperature: 1.9 }, 'claude-sonnet-4-5');
		expect(body['temperature']).toBe(1);
	});
});

/**
 * **There is no `tool` role in this protocol** (E7 / `12-…` D12's transcript
 * strategy meets a provider that only ever has `user`/`assistant`). A
 * `role:'tool'` message becomes a `user` turn carrying a `tool_result` block;
 * an assistant turn with `toolCalls` becomes content blocks, `text` then
 * `tool_use`, rather than OpenAI's separate `tool_calls` array.
 */
describe('the tool-call protocol translated into content blocks', () => {
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

	it('turns an assistant tool call into text + tool_use blocks', () => {
		const messages = buildRequestBody(withCalls, 'claude-sonnet-4-5')['messages'] as Array<
			Record<string, unknown>
		>;

		expect(messages[0]).toEqual({
			role: 'assistant',
			content: [
				{ type: 'text', text: 'Going east.' },
				{ type: 'tool_use', id: 'call_1', name: 'move', input: { direction: 'east' } }
			]
		});
	});

	it('turns a tool result into a user turn carrying a tool_result block', () => {
		const messages = buildRequestBody(withCalls, 'claude-sonnet-4-5')['messages'] as Array<
			Record<string, unknown>
		>;

		expect(messages[1]).toEqual({
			role: 'user',
			content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'You moved east.' }]
		});
	});

	it('omits the text block when the assistant said nothing before calling', () => {
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
		const messages = buildRequestBody(silent, 'claude-sonnet-4-5')['messages'] as Array<
			Record<string, unknown>
		>;
		expect(messages[0]?.['content']).toEqual([
			{ type: 'tool_use', id: 'call_2', name: 'move', input: {} }
		]);
	});

	it('sends an ordinary assistant message as a plain string, not a block array', () => {
		const plain = {
			...CHAT_REQUEST,
			messages: [{ role: 'assistant' as const, content: 'Just thinking.' }]
		};
		const messages = buildRequestBody(plain, 'claude-sonnet-4-5')['messages'] as Array<
			Record<string, unknown>
		>;
		expect(messages[0]).toEqual({ role: 'assistant', content: 'Just thinking.' });
	});
});

describe('tools', () => {
	it('translates to input_schema, not OpenAI-style function wrapping', () => {
		const body = buildRequestBody(CHAT_REQUEST, 'claude-sonnet-4-5');
		expect(body['tools']).toEqual([
			{
				name: 'move',
				description: 'Roll one square.',
				input_schema: { type: 'object', properties: { direction: { type: 'string' } } }
			}
		]);
	});

	it('is omitted when there are none', () => {
		const body = buildRequestBody({ ...CHAT_REQUEST, tools: [] }, 'claude-sonnet-4-5');
		expect('tools' in body).toBe(false);
	});
});

describe('the rest of the body', () => {
	it('sends max_tokens (mandatory here, unlike OpenAI) and stream:true', () => {
		const body = buildRequestBody(CHAT_REQUEST, 'claude-sonnet-4-5');
		expect(body['max_tokens']).toBe(CHAT_REQUEST.maxTokens);
		expect(body['stream']).toBe(true);
		expect(body['model']).toBe('claude-sonnet-4-5');
	});
});
