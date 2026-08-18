import type { ChatRequest, ChatResponse, ToolSchema } from '@craftabot/core';
import { z } from 'zod';

/**
 * **Ollama's `/v1/chat/completions` wire format is OpenAI's**, by design —
 * this endpoint exists specifically so OpenAI-shaped clients work against a
 * local model unchanged. This file is deliberately close to
 * `pack-openai/wire.ts` for exactly that reason, with the one real
 * difference being what is *absent*: no fixed-temperature model family, no
 * hidden-reasoning budget to cap — those are GPT-5-specific constraints
 * `pack-openai/catalogue.ts` found live, and nothing here should imply a
 * local model shares them. Every cartridge's `temperature` reaches the wire
 * as sent.
 *
 * Responses are Zod-checked leniently (`.loose()`, generous optionality) —
 * `10-CODING-STANDARDS.md` §1.
 */

export const streamChunkSchema = z
	.object({
		choices: z
			.array(
				z
					.object({
						delta: z
							.object({
								content: z.string().nullable().optional(),
								tool_calls: z
									.array(
										z
											.object({
												index: z.number().optional(),
												id: z.string().optional(),
												function: z
													.object({
														name: z.string().optional(),
														arguments: z.string().optional()
													})
													.optional()
											})
											.loose()
									)
									.optional()
							})
							.loose()
							.optional(),
						finish_reason: z.string().nullable().optional()
					})
					.loose()
			)
			.optional(),
		usage: z
			.object({
				prompt_tokens: z.number().optional(),
				completion_tokens: z.number().optional()
			})
			.loose()
			.nullable()
			.optional()
	})
	.loose();

export type StreamChunk = z.infer<typeof streamChunkSchema>;

export interface StreamAccumulator {
	add(chunk: StreamChunk): { textDelta: string };
	finish(raw: unknown): ChatResponse;
}

export function createStreamAccumulator(): StreamAccumulator {
	let text = '';
	let finishReason: string | undefined;
	let toolName = '';
	let toolArguments = '';
	let usage = { inputTokens: 0, outputTokens: 0 };

	return {
		add(chunk) {
			const choice = chunk.choices?.[0];
			const delta = choice?.delta;
			const textDelta = delta?.content ?? '';
			if (textDelta) text += textDelta;

			// V1 honours one tool call per tick (06 §2), same restriction the
			// other three provider packs apply to their own equivalents.
			const call = delta?.tool_calls?.find((entry) => (entry.index ?? 0) === 0);
			if (call?.function?.name) toolName += call.function.name;
			if (call?.function?.arguments) toolArguments += call.function.arguments;

			if (choice?.finish_reason) finishReason = choice.finish_reason;
			if (chunk.usage) {
				usage = {
					inputTokens: chunk.usage.prompt_tokens ?? usage.inputTokens,
					outputTokens: chunk.usage.completion_tokens ?? usage.outputTokens
				};
			}
			return { textDelta };
		},

		finish(raw) {
			const toolCall =
				toolName === '' ? null : { name: toolName, arguments: parseArguments(toolArguments) };
			return {
				text,
				toolCall,
				usage,
				raw,
				finishReason: mapFinishReason(finishReason, toolCall !== null)
			};
		}
	};
}

function parseArguments(raw: string): unknown {
	if (raw.trim() === '') return {};
	try {
		return JSON.parse(raw);
	} catch {
		return {};
	}
}

function mapFinishReason(
	reason: string | undefined,
	hasToolCall: boolean
): ChatResponse['finishReason'] {
	switch (reason) {
		case 'stop':
			return hasToolCall ? 'tool_call' : 'stop';
		case 'tool_calls':
			return 'tool_call';
		case 'length':
			return 'length';
		case 'content_filter':
			return 'filtered';
		default:
			return hasToolCall ? 'tool_call' : 'stop';
	}
}

/** Our `ChatRequest` into an OpenAI-shaped request body — no model-specific carve-outs. */
export function buildRequestBody(request: ChatRequest, model: string): Record<string, unknown> {
	return {
		model,
		messages: request.messages.map((message) => ({
			role: message.role,
			content: message.content,
			...(message.toolCallId !== undefined ? { tool_call_id: message.toolCallId } : {}),
			...(message.name !== undefined ? { name: message.name } : {}),
			...(message.toolCalls !== undefined && message.toolCalls.length > 0
				? {
						tool_calls: message.toolCalls.map((call) => ({
							id: call.id,
							type: 'function',
							function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
						}))
					}
				: {})
		})),
		...(request.tools && request.tools.length > 0 ? { tools: toWireTools(request.tools) } : {}),
		temperature: request.temperature,
		max_tokens: request.maxTokens,
		stream: true
	};
}

function toWireTools(tools: ToolSchema[]) {
	return tools.map((tool) => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters
		}
	}));
}
