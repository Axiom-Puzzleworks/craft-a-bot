import type { JsonSchema } from './json-schema.js';
import type { ChatMessage, ChatResponse } from '../schemas/shared.js';

/**
 * The LLM provider abstraction the engine consumes; packs implement it
 * (06-LLM-PROVIDERS.md §2, explicitly owned by @craftabot/core). No SDKs,
 * no provider-specific JSON escapes past the pack boundary (05-TECH-STACK.md §9).
 *
 * `ChatMessage` and `ChatResponse` are defined once, in Zod, and inferred here
 * (E5, `14-…` §3): both are written verbatim into `prompt.composed` and
 * `think.completed`, so they cross the trace boundary and the schema is the
 * type. See `schemas/shared.ts`.
 */
export type { ChatMessage, ChatResponse };
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

export type ChatRole = ChatMessage['role'];

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

/** Normalised wire-failure vocabulary the UI renders in kit language (06-LLM-PROVIDERS.md §7). */
export type ProviderErrorKind =
	'bad-key' | 'rate-limited' | 'quota' | 'filtered' | 'network' | 'provider-down' | 'malformed';

export interface ProviderError {
	kind: ProviderErrorKind;
	message: string;
	retryAfterMs?: number;
	raw?: unknown;
}
