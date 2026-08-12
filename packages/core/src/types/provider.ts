import type { JsonSchema } from './json-schema.js';

/**
 * The LLM provider abstraction the engine consumes; packs implement it
 * (06-LLM-PROVIDERS.md §2, explicitly owned by @craftabot/core). No SDKs,
 * no provider-specific JSON escapes past the pack boundary (05-TECH-STACK.md §9).
 */
export interface LLMProvider {
	id: string; // "openai", "mock", later: "anthropic", ...
	name: string;
	keyRequirement: 'required' | 'none'; // ollama/mock: none
	validateKey(key: string): Promise<KeyCheck>;
	chat(
		req: ChatRequest,
		opts: { signal: AbortSignal; onToken?: (t: string) => void }
	): Promise<ChatResponse>;
}

export interface KeyCheck {
	ok: boolean;
	message: string;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
	role: ChatRole;
	content: string;
	/** Present on `role: 'tool'` messages — which tool call this result answers. */
	toolCallId?: string;
	/** Present on `role: 'tool'` messages — the tool name. */
	name?: string;
}

export interface ToolSchema {
	name: string;
	description: string;
	parameters: JsonSchema;
}

export interface ChatRequest {
	model: string; // provider-native model id from the cartridge
	messages: ChatMessage[];
	tools?: ToolSchema[];
	temperature: number;
	maxTokens: number;
}

export interface ChatResponse {
	text: string; // assistant prose ("thought")
	toolCall?: { name: string; arguments: unknown } | null; // at most one honoured (V1 rule)
	usage: { inputTokens: number; outputTokens: number };
	raw: unknown; // exact wire response, for the trace
	finishReason: 'stop' | 'tool_call' | 'length' | 'filtered' | 'other';
}

/** Normalised wire-failure vocabulary the UI renders in kit language (06-LLM-PROVIDERS.md §7). */
export type ProviderErrorKind =
	'bad-key' | 'rate-limited' | 'quota' | 'filtered' | 'network' | 'provider-down' | 'malformed';

export interface ProviderError {
	kind: ProviderErrorKind;
	message: string;
	retryAfterMs?: number;
	raw?: unknown;
}
