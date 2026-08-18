import type { ChatMessage, ChatRequest, ChatResponse, ToolSchema } from '@craftabot/core';
import { z } from 'zod';

/**
 * The Gemini `generateContent` wire format (`06-…` §4's discipline, a third
 * shape again).
 *
 * Structural differences from both `pack-openai` and `pack-anthropic`:
 *
 * 1. **Roles are `user`/`model`**, not `user`/`assistant` — an assistant
 *    turn is translated to `role: 'model'`.
 * 2. **The system prompt is `systemInstruction`**, a top-level field like
 *    Anthropic's `system`, but shaped as `{parts:[{text}]}` rather than a
 *    bare string.
 * 3. **A tool call is `functionCall`, matched by name, not by id.** Gemini
 *    has no id concept for a call/result pair the way OpenAI's
 *    `tool_call_id` or Anthropic's `tool_use_id` do — a `functionResponse`
 *    names the function it is answering, nothing else, which is also why
 *    `functionCall.args` arrives as a real parsed object rather than a JSON
 *    string built up across streamed deltas: there is no id to key partial
 *    fragments against, so Gemini does not stream them in pieces at all.
 *
 * Responses are Zod-checked leniently (`.loose()`, generous optionality) —
 * `10-CODING-STANDARDS.md` §1.
 */

const usageMetadataSchema = z
	.object({
		promptTokenCount: z.number().optional(),
		candidatesTokenCount: z.number().optional()
	})
	.loose();

const partSchema = z
	.object({
		text: z.string().optional(),
		functionCall: z.object({ name: z.string(), args: z.unknown().optional() }).loose().optional()
	})
	.loose();

/** One streamed `GenerateContentResponse` chunk — a whole JSON object per SSE frame. */
export const streamChunkSchema = z
	.object({
		candidates: z
			.array(
				z
					.object({
						content: z
							.object({ parts: z.array(partSchema).optional() })
							.loose()
							.optional(),
						finishReason: z.string().optional()
					})
					.loose()
			)
			.optional(),
		usageMetadata: usageMetadataSchema.optional()
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
	let toolCall: { name: string; arguments: unknown } | undefined;
	let usage = { inputTokens: 0, outputTokens: 0 };

	return {
		add(chunk) {
			let textDelta = '';
			const candidate = chunk.candidates?.[0];
			for (const part of candidate?.content?.parts ?? []) {
				if (part.text) {
					text += part.text;
					textDelta += part.text;
				}
				// V1 honours one tool call per tick (06 §2): only the first
				// functionCall part seen this turn is kept.
				if (part.functionCall && !toolCall) {
					toolCall = { name: part.functionCall.name, arguments: part.functionCall.args ?? {} };
				}
			}
			if (candidate?.finishReason) finishReason = candidate.finishReason;
			if (chunk.usageMetadata) {
				usage = {
					inputTokens: chunk.usageMetadata.promptTokenCount ?? usage.inputTokens,
					outputTokens: chunk.usageMetadata.candidatesTokenCount ?? usage.outputTokens
				};
			}
			return { textDelta };
		},

		finish(raw) {
			return {
				text,
				toolCall: toolCall ?? null,
				usage,
				raw,
				finishReason: mapFinishReason(finishReason, toolCall !== undefined)
			};
		}
	};
}

function mapFinishReason(
	reason: string | undefined,
	hasToolCall: boolean
): ChatResponse['finishReason'] {
	switch (reason) {
		case 'MAX_TOKENS':
			return 'length';
		// SAFETY and RECITATION are both refusals-of-a-kind (the second is
		// "too close to training data to repeat"), reported honestly the
		// same way (06 §7).
		case 'SAFETY':
		case 'RECITATION':
			return 'filtered';
		case 'STOP':
		default:
			return hasToolCall ? 'tool_call' : 'stop';
	}
}

/** Our `ChatRequest` into a Gemini `generateContent` request body. */
export function buildRequestBody(request: ChatRequest): Record<string, unknown> {
	const systemText = request.messages
		.filter((message) => message.role === 'system')
		.map((message) => message.content)
		.join('\n\n');

	return {
		...(systemText !== '' ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
		contents: toGeminiContents(request.messages.filter((message) => message.role !== 'system')),
		...(request.tools && request.tools.length > 0
			? { tools: [{ functionDeclarations: toWireTools(request.tools) }] }
			: {}),
		generationConfig: {
			temperature: request.temperature,
			maxOutputTokens: request.maxTokens
		}
	};
}

function toGeminiContents(messages: ChatMessage[]): unknown[] {
	return messages.map((message) => {
		if (message.role === 'tool') {
			// Matched by name, not an id — Gemini has no call/result id concept.
			return {
				role: 'user',
				parts: [
					{ functionResponse: { name: message.name ?? '', response: { content: message.content } } }
				]
			};
		}

		if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
			// One tool call per tick (V1 rule) — only the first is ever present.
			const call = message.toolCalls[0];
			const parts: unknown[] = [];
			if (message.content.trim() !== '') parts.push({ text: message.content });
			if (call) parts.push({ functionCall: { name: call.name, args: call.arguments ?? {} } });
			return { role: 'model', parts };
		}

		return {
			role: message.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: message.content }]
		};
	});
}

function toWireTools(tools: ToolSchema[]) {
	return tools.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
}
