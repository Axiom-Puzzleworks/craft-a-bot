import type { ChatMessage, ChatRequest, ChatResponse, ToolSchema } from '@craftabot/core';
import { z } from 'zod';
import { MAX_TEMPERATURE } from './catalogue.js';

/**
 * The Anthropic Messages API wire format (`06-…` §4's discipline, applied to
 * a genuinely different shape than OpenAI's).
 *
 * Three structural differences from `pack-openai/wire.ts`, all handled here
 * so nothing downstream has to know Anthropic exists:
 *
 * 1. **The system prompt is a top-level field, not a message.** `ChatMessage`
 *    role `'system'` messages are pulled out of the array and joined into
 *    `system`; `composeSystemMessage` (`core/session/prompt.ts`) only ever
 *    produces one, so this is a join over an array of at most one element in
 *    practice, not a real merge.
 * 2. **There is no `'tool'` role.** A tool's result travels back as a `user`
 *    message whose content is a `tool_result` block — Anthropic's messages
 *    array only ever has `user`/`assistant`, unlike OpenAI's four roles.
 * 3. **A tool call is a content block, not a sibling field.** An assistant
 *    turn that both spoke and called a tool is one message with two content
 *    blocks (`text`, then `tool_use`), where OpenAI carries them as `content`
 *    plus a separate `tool_calls` array.
 *
 * Responses are Zod-checked leniently (`.loose()`, generous optionality) —
 * `10-CODING-STANDARDS.md` §1: a runtime boundary is validated, but a
 * provider adding a field must never break a run.
 */

const usageSchema = z
	.object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
	.loose();

/** One SSE event. Every field is optional; which ones are present depends on `type`. */
export const streamChunkSchema = z
	.object({
		type: z.string(),
		message: z.object({ usage: usageSchema.optional() }).loose().optional(),
		index: z.number().optional(),
		content_block: z
			.object({
				type: z.string().optional(),
				id: z.string().optional(),
				name: z.string().optional()
			})
			.loose()
			.optional(),
		delta: z
			.object({
				type: z.string().optional(),
				text: z.string().optional(),
				partial_json: z.string().optional(),
				stop_reason: z.string().nullable().optional()
			})
			.loose()
			.optional(),
		usage: usageSchema.optional()
	})
	.loose();

export type StreamChunk = z.infer<typeof streamChunkSchema>;

export interface StreamAccumulator {
	add(chunk: StreamChunk): { textDelta: string };
	finish(raw: unknown): ChatResponse;
}

export function createStreamAccumulator(): StreamAccumulator {
	let text = '';
	let stopReason: string | undefined;
	let toolName = '';
	let toolArgsJson = '';
	/** Which content-block index is the tool call — text and tool_use are separate blocks. */
	let toolBlockIndex: number | undefined;
	let usage = { inputTokens: 0, outputTokens: 0 };

	return {
		add(chunk) {
			let textDelta = '';
			switch (chunk.type) {
				case 'message_start': {
					const inputTokens = chunk.message?.usage?.input_tokens;
					if (inputTokens !== undefined) usage = { ...usage, inputTokens };
					break;
				}
				case 'content_block_start': {
					const block = chunk.content_block;
					// V1 honours one tool call per tick (06 §2): only the first
					// tool_use block this turn is tracked, same restriction
					// `pack-openai` applies to its own `tool_calls` array.
					if (block?.type === 'tool_use' && toolBlockIndex === undefined) {
						toolBlockIndex = chunk.index;
						toolName = block.name ?? '';
					}
					break;
				}
				case 'content_block_delta': {
					const delta = chunk.delta;
					if (delta?.type === 'text_delta' && delta.text) {
						text += delta.text;
						textDelta = delta.text;
					} else if (
						delta?.type === 'input_json_delta' &&
						chunk.index === toolBlockIndex &&
						delta.partial_json
					) {
						toolArgsJson += delta.partial_json;
					}
					break;
				}
				case 'message_delta': {
					if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
					const outputTokens = chunk.usage?.output_tokens;
					if (outputTokens !== undefined) usage = { ...usage, outputTokens };
					break;
				}
			}
			return { textDelta };
		},

		finish(raw) {
			const toolCall =
				toolName === '' ? null : { name: toolName, arguments: parseArguments(toolArgsJson) };
			return {
				text,
				toolCall,
				usage,
				raw,
				finishReason: mapFinishReason(stopReason, toolCall !== null)
			};
		}
	};
}

/**
 * Tool arguments arrive as a JSON *string* assembled across chunks, same as
 * OpenAI's. A model can emit invalid JSON; that is a mumble, not a crash, so
 * it degrades to an empty object and the world refuses the call in character.
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
	stopReason: string | undefined,
	hasToolCall: boolean
): ChatResponse['finishReason'] {
	switch (stopReason) {
		case 'tool_use':
			return 'tool_call';
		case 'max_tokens':
			return 'length';
		// A newer, still-answering-something refusal: Claude can decline
		// mid-turn on safety grounds and end the turn this way rather than
		// with an ordinary stop (06 §7's "filtered" kind exists for exactly
		// this — a refusal is reported honestly, not dressed up as empty).
		case 'refusal':
			return 'filtered';
		case 'end_turn':
		case 'stop_sequence':
		default:
			return hasToolCall ? 'tool_call' : 'stop';
	}
}

/** Anthropic 400s on any `temperature` above 1 — a hard reject, not a clamp server-side. */
export function clampTemperature(value: number): number {
	return Math.min(Math.max(value, 0), MAX_TEMPERATURE);
}

/** Our `ChatRequest` into an Anthropic Messages request body. */
export function buildRequestBody(request: ChatRequest, model: string): Record<string, unknown> {
	const system = request.messages
		.filter((message) => message.role === 'system')
		.map((message) => message.content)
		.join('\n\n');

	return {
		model,
		max_tokens: request.maxTokens,
		...(system !== '' ? { system } : {}),
		messages: toAnthropicMessages(request.messages.filter((message) => message.role !== 'system')),
		...(request.tools && request.tools.length > 0 ? { tools: toWireTools(request.tools) } : {}),
		temperature: clampTemperature(request.temperature),
		stream: true
	};
}

function toAnthropicMessages(messages: ChatMessage[]): unknown[] {
	return messages.map((message) => {
		if (message.role === 'tool') {
			// No `tool` role in this protocol — a result travels back as a
			// user turn carrying a `tool_result` block.
			return {
				role: 'user',
				content: [
					{ type: 'tool_result', tool_use_id: message.toolCallId ?? '', content: message.content }
				]
			};
		}

		if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
			// One tool call per tick (V1 rule) — only the first is ever present.
			const call = message.toolCalls[0];
			const blocks: unknown[] = [];
			if (message.content.trim() !== '') blocks.push({ type: 'text', text: message.content });
			if (call)
				blocks.push({
					type: 'tool_use',
					id: call.id,
					name: call.name,
					input: call.arguments ?? {}
				});
			return { role: 'assistant', content: blocks };
		}

		return { role: message.role, content: message.content };
	});
}

function toWireTools(tools: ToolSchema[]) {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		input_schema: tool.parameters
	}));
}
