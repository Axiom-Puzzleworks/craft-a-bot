import { z } from 'zod';
import type { ChatMessage, ChatResponse } from '@craftabot/core';

/**
 * **The OpenAI chat-completions wire** (WP127, `107-THE-GATE.md` §2): the
 * request and the response as a client and an upstream speak them, parsed
 * loosely — the Gate reads the fields it needs and forwards the rest — and
 * mapped to and from core's `ChatMessage` and `ChatResponse`, so the chain
 * sees the same shapes a session hands it.
 */
const wireToolCallSchema = z
	.object({
		id: z.string(),
		type: z.literal('function').default('function'),
		function: z.object({ name: z.string(), arguments: z.string() })
	})
	.passthrough();
export type WireToolCall = z.infer<typeof wireToolCallSchema>;

const wireMessageSchema = z
	.object({
		role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
		content: z.union([z.string(), z.null(), z.array(z.unknown())]).optional(),
		name: z.string().optional(),
		tool_calls: z.array(wireToolCallSchema).optional(),
		tool_call_id: z.string().optional()
	})
	.passthrough();
export type WireMessage = z.infer<typeof wireMessageSchema>;

export const wireRequestSchema = z
	.object({
		model: z.string().optional(),
		messages: z.array(wireMessageSchema).min(1),
		stream: z.boolean().optional()
	})
	.passthrough();
export type WireRequest = z.infer<typeof wireRequestSchema>;

export const wireResponseSchema = z
	.object({
		id: z.string().optional(),
		model: z.string().optional(),
		choices: z
			.array(
				z
					.object({
						index: z.number().optional(),
						message: z
							.object({
								role: z.literal('assistant').default('assistant'),
								content: z.union([z.string(), z.null()]).optional(),
								tool_calls: z.array(wireToolCallSchema).optional()
							})
							.passthrough(),
						finish_reason: z.string().nullable().optional()
					})
					.passthrough()
			)
			.min(1),
		usage: z
			.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() })
			.passthrough()
			.optional()
	})
	.passthrough();
export type WireResponse = z.infer<typeof wireResponseSchema>;

/** A message's text: a string as it is, an array of parts as its text parts joined, nothing as empty. */
export function textOf(content: WireMessage['content']): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content))
		return content
			.map((part) =>
				typeof part === 'object' && part !== null && 'text' in part
					? String((part as { text: unknown }).text)
					: ''
			)
			.join('');
	return '';
}

/** A call's arguments, parsed from their JSON string; a string that is not JSON stays a string. */
export function argumentsOf(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return raw;
	}
}

/** The request's messages as core's: `developer` reads as `system`, a tool call's arguments parsed. */
export function toChatMessages(messages: readonly WireMessage[]): ChatMessage[] {
	return messages.map((message) => ({
		role: message.role === 'developer' ? 'system' : message.role,
		content: textOf(message.content),
		...(message.tool_call_id !== undefined ? { toolCallId: message.tool_call_id } : {}),
		...(message.name !== undefined ? { name: message.name } : {}),
		...(message.tool_calls && message.tool_calls.length > 0
			? {
					toolCalls: message.tool_calls.map((call) => ({
						id: call.id,
						name: call.function.name,
						arguments: argumentsOf(call.function.arguments)
					}))
				}
			: {})
	}));
}

/** Core's messages on the wire — what a session's prompt looks like to an OpenAI client. */
export function fromChatMessages(messages: readonly ChatMessage[]): WireMessage[] {
	return messages.map((message) => ({
		role: message.role,
		content: message.content,
		...(message.toolCallId !== undefined ? { tool_call_id: message.toolCallId } : {}),
		...(message.name !== undefined ? { name: message.name } : {}),
		...(message.toolCalls && message.toolCalls.length > 0
			? {
					tool_calls: message.toolCalls.map((call) => ({
						id: call.id,
						type: 'function' as const,
						function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
					}))
				}
			: {})
	}));
}

const FINISH: Record<string, ChatResponse['finishReason']> = {
	stop: 'stop',
	tool_calls: 'tool_call',
	function_call: 'tool_call',
	length: 'length',
	content_filter: 'filtered'
};

/** The upstream's first choice as core's `ChatResponse`: its first call, its usage, its finish. */
export function toChatResponse(response: WireResponse): ChatResponse {
	const [choice] = response.choices;
	const message = choice!.message;
	const [first] = message.tool_calls ?? [];
	return {
		text: message.content ?? '',
		toolCall: first
			? { name: first.function.name, arguments: argumentsOf(first.function.arguments) }
			: null,
		usage: {
			inputTokens: response.usage?.prompt_tokens ?? 0,
			outputTokens: response.usage?.completion_tokens ?? 0
		},
		raw: response,
		finishReason: FINISH[choice!.finish_reason ?? ''] ?? 'other'
	};
}

/** Core's `ChatResponse` on the wire — how a test upstream answers as a session's mock did. */
export function fromChatResponse(response: ChatResponse, callId: string): WireResponse {
	return {
		id: `gate-${callId}`,
		choices: [
			{
				index: 0,
				message: {
					role: 'assistant',
					content: response.text,
					...(response.toolCall
						? {
								tool_calls: [
									{
										id: callId,
										type: 'function' as const,
										function: {
											name: response.toolCall.name,
											arguments: JSON.stringify(response.toolCall.arguments ?? {})
										}
									}
								]
							}
						: {})
				},
				finish_reason: response.toolCall ? 'tool_calls' : 'stop'
			}
		],
		usage: {
			prompt_tokens: response.usage.inputTokens,
			completion_tokens: response.usage.outputTokens
		}
	};
}
