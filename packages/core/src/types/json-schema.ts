/**
 * Loose JSON-schema type for tool/action parameter definitions
 * (02-AGENT-MODEL.md §2.3, §4). Not validated as a schema itself — the
 * provider's native tool-calling API is the actual consumer (06-LLM-PROVIDERS.md §2).
 */
export type JsonSchema = Record<string, unknown>;
