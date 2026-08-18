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

/**
 * **A provider, registered like any other pack content** (`06-…` §8, WP26).
 *
 * Until now exactly one provider existed and `apps/workbench/src/lib/brain.ts`
 * named it by hand — `if (cartridge.providerId === OPENAI_PROVIDER_ID)`, with
 * everything else silently falling through to the mock brain rather than
 * genuinely erroring. That is precisely the shape hard rule 4 exists to
 * prevent: a growing app-level if/else standing in for a real extension
 * point, the same defect `contributeGuardrails` (WP14) fixed for bricks.
 *
 * A `ProviderFactory` is data plus one function, the same shape a
 * `ToolDefinition` or `GuardrailDefinition` already is — building an
 * `LLMProvider` is executable, but *which* providers exist and how to build
 * one is content a pack contributes, not a mechanism it invents.
 */
export interface ProviderFactory {
	/** Matches `LLMProvider.id` and every `CartridgeDefinition.providerId` naming it. */
	id: string;
	name: string;
	keyRequirement: 'required' | 'none';
	/** Where a user manages this provider's keys, for the battery compartment's link. Omitted for a keyless provider. */
	keysUrl?: string;
	/** `apiKey` is `''` for a keyless provider — still called, so local providers (Ollama) build the same way as any other. */
	create(options: { apiKey: string; fetch?: typeof globalThis.fetch }): LLMProvider;
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
