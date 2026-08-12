import type { ChatRequest, ChatResponse, ToolSchema } from '@craftabot/core';
import { z } from 'zod';
import { reasoningEffortFor, supportsTemperature } from './catalogue.js';

/**
 * The OpenAI Chat Completions wire format (06-LLM-PROVIDERS.md §4).
 *
 * Responses are a runtime boundary, so they are Zod-checked rather than trusted
 * (10-CODING-STANDARDS.md §1) — but leniently: `passthrough` and generous
 * optionality, because a provider adding a field must never break a run. What
 * we validate is the shape we actually read.
 */

/** One streamed chunk. Everything is optional; different chunks carry different parts. */
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

/** Accumulates streamed chunks into one `ChatResponse`. */
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

			// V1 honours one tool call per tick (06 §2), so only the first index is
			// accumulated; the trace records that any others were ignored.
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

/**
 * Tool arguments arrive as a JSON *string* assembled across chunks. A model can
 * emit invalid JSON; that is a mumble, not a crash, so it degrades to an empty
 * object and the world refuses the call in character.
 */
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
		case 'function_call':
			return 'tool_call';
		case 'length':
			return 'length';
		case 'content_filter':
			return 'filtered';
		default:
			return hasToolCall ? 'tool_call' : 'stop';
	}
}

/** Our `ChatRequest` into an OpenAI request body. */
export function buildRequestBody(request: ChatRequest, model: string): Record<string, unknown> {
	const reasoningEffort = reasoningEffortFor(model);
	return {
		model,
		messages: request.messages.map((message) => ({
			role: message.role,
			content: message.content,
			...(message.toolCallId !== undefined ? { tool_call_id: message.toolCallId } : {}),
			...(message.name !== undefined ? { name: message.name } : {})
		})),
		...(request.tools && request.tools.length > 0 ? { tools: toWireTools(request.tools) } : {}),
		// Omitted entirely for models that only accept the default: sending it is
		// a hard 400, not a warning, so the whole tick would fail (see catalogue).
		...(supportsTemperature(model) ? { temperature: request.temperature } : {}),
		// Caps hidden reasoning, which otherwise eats the whole budget before the
		// model says anything visible (see catalogue).
		...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
		max_completion_tokens: request.maxTokens,
		stream: true,
		// Usage only arrives in the final chunk if we ask for it (06 §4).
		stream_options: { include_usage: true }
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
