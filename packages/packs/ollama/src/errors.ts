import type { ProviderError, ProviderErrorKind } from '@craftabot/core';

/**
 * The error normalisation table (`06-…` §7), for the one provider where the
 * two most likely failures are not billing or auth at all: **the local
 * server is not running**, and **the model tag was never pulled**. Neither
 * has a natural home in the seven-kind vocabulary the other three packs use
 * comfortably — this file's job is picking the least-misleading kind for
 * each and making the *message* carry the rest.
 */

export const KEY_REDACTED = '[key-redacted]';

/**
 * Kept for interface parity with the other three provider packs even though
 * `apiKey` is always `''` here (`keyRequirement: 'none'`) — scrubbing an
 * empty key is a documented no-op (`if (key.trim() === '') return value`),
 * so this never does anything, and that is fine: consistency across the
 * four packs is worth more than a branch that only ever runs for three of
 * them.
 */
export function scrubKey<T>(value: T, key: string): T {
	if (key.trim() === '') return value;
	if (typeof value === 'string') return value.split(key).join(KEY_REDACTED) as T;
	if (Array.isArray(value)) return value.map((entry) => scrubKey(entry, key)) as T;
	if (value instanceof Error) {
		const copy = new Error(scrubKey(value.message, key));
		copy.name = value.name;
		return copy as T;
	}
	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [name, entry] of Object.entries(value)) result[name] = scrubKey(entry, key);
		return result as T;
	}
	return value;
}

export function scrubProviderError(error: ProviderError, key: string): ProviderError {
	return { ...error, message: scrubKey(error.message, key), raw: scrubKey(error.raw, key) };
}

/** Typed error object, thrown so stack traces survive (10-CODING-STANDARDS.md §1). */
export class OllamaError extends Error {
	readonly kind: ProviderErrorKind;
	readonly providerError: ProviderError;

	constructor(providerError: ProviderError) {
		super(providerError.message);
		this.name = 'OllamaError';
		this.kind = providerError.kind;
		this.providerError = providerError;
	}
}

interface WireErrorBody {
	error?: { message?: unknown };
}

export function normaliseHttpError(status: number, body: unknown, model: string): ProviderError {
	const message = extractMessage(body);

	// The everyday Ollama failure: the cartridge names a tag nobody pulled.
	// A bare 404 with a generic "not found" would send a builder hunting for
	// a typo in their own bot instead of a terminal command.
	if (status === 404) {
		return {
			kind: 'malformed',
			message: `"${model}" is not pulled on this Ollama server yet. Run \`ollama pull ${model}\` and try again.`,
			raw: body
		};
	}
	if (status === 401 || status === 403) {
		return { kind: 'bad-key', message: message ?? `Ollama returned ${status}.`, raw: body };
	}
	if (status === 429) {
		return { kind: 'rate-limited', message: message ?? `Ollama returned ${status}.`, raw: body };
	}
	if (status >= 500) {
		return { kind: 'provider-down', message: message ?? `Ollama returned ${status}.`, raw: body };
	}
	return { kind: 'malformed', message: message ?? `Ollama returned ${status}.`, raw: body };
}

/**
 * The other everyday failure: nothing is listening on `localhost:11434` at
 * all, because Ollama is not running. `fetch` rejecting looks identical to
 * "the user is offline" from inside the generic network-error path every
 * other pack shares — which is true, technically, and useless in practice.
 * This is the one place a provider pack's own copy overrides the generic
 * message, because for this provider specifically the likely cause is
 * knowable and the generic one is not.
 */
export function normaliseNetworkError(cause: unknown, baseUrl: string): ProviderError {
	return {
		kind: 'network',
		message: `Could not reach Ollama at ${baseUrl}. Is it running on this computer?`,
		raw: cause instanceof Error ? { name: cause.name, message: cause.message } : cause
	};
}

export function normaliseMalformed(message: string, raw: unknown): ProviderError {
	return { kind: 'malformed', message, raw };
}

export function normaliseFiltered(raw: unknown): ProviderError {
	return { kind: 'filtered', message: 'The provider declined to answer this prompt.', raw };
}

function extractMessage(body: unknown): string | undefined {
	if (typeof body !== 'object' || body === null) return undefined;
	const error = (body as WireErrorBody).error;
	if (typeof error !== 'object' || error === null) return undefined;
	return typeof error.message === 'string' ? error.message : undefined;
}
