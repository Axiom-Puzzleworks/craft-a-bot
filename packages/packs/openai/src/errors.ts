import type { ProviderError, ProviderErrorKind } from '@craftabot/core';

/**
 * The error normalisation table (06-LLM-PROVIDERS.md §7).
 *
 * Wire failures become a small typed vocabulary the UI can render in kit
 * language, and the raw payload always travels alongside so the trace keeps the
 * truth (03 §9: "friendly copy is a layer, never a replacement").
 *
 * **Nothing here may ever include the API key.** These messages reach event
 * payloads, the trace, and exports — hard rule 2.
 *
 * That guarantee used to rest on "the key is never passed into this module".
 * A live run against a deliberately wrong key disproved it: OpenAI's 401 body
 * quotes the rejected key back inside its own message ("Incorrect API key
 * provided: sk-…"). The secret does not have to be passed *in* to leak — it
 * arrives *back from the provider*. So the guarantee now rests on `scrubKey`,
 * applied by the provider to every error before it escapes the pack.
 */

export const KEY_REDACTED = '[key-redacted]';

/**
 * Remove a key from anywhere it appears in a provider error, however deeply.
 *
 * Core's `redactSecrets` (WP4) matches whole string values, which is right for
 * the data it guards — but useless here, because the key arrives embedded in a
 * sentence. Substring replacement is what that case needs, and the provider is
 * the only layer that knows the secret to look for.
 */
export function scrubKey<T>(value: T, key: string): T {
	if (key.trim() === '') return value;
	if (typeof value === 'string') return value.split(key).join(KEY_REDACTED) as T;
	if (Array.isArray(value)) return value.map((entry) => scrubKey(entry, key)) as T;
	if (value instanceof Error) {
		// Errors do not survive a spread; the message is the part that travels.
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

/** A whole `ProviderError` with the key scrubbed out of every field. */
export function scrubProviderError(error: ProviderError, key: string): ProviderError {
	return { ...error, message: scrubKey(error.message, key), raw: scrubKey(error.raw, key) };
}

/** Typed error object, thrown so stack traces survive (10-CODING-STANDARDS.md §1). */
export class OpenAiError extends Error {
	readonly kind: ProviderErrorKind;
	readonly providerError: ProviderError;

	constructor(providerError: ProviderError) {
		super(providerError.message);
		this.name = 'OpenAiError';
		this.kind = providerError.kind;
		this.providerError = providerError;
	}
}

/** Shape of the `{ error: { ... } }` body OpenAI returns on failure. */
interface WireErrorBody {
	error?: { message?: unknown; type?: unknown; code?: unknown };
}

export function normaliseHttpError(
	status: number,
	body: unknown,
	headers?: { get(name: string): string | null }
): ProviderError {
	const detail = extractDetail(body);
	const code = String(detail.code ?? '');
	const type = String(detail.type ?? '');
	const message = detail.message ?? `OpenAI returned ${status}.`;

	// Quota is a 429 too, so it has to be checked before rate limiting.
	if (code === 'insufficient_quota' || type === 'insufficient_quota') {
		return { kind: 'quota', message, raw: body };
	}
	if (status === 401 || status === 403) {
		return { kind: 'bad-key', message, raw: body };
	}
	if (status === 429) {
		const retryAfterMs = parseRetryAfter(headers?.get('retry-after'));
		return {
			kind: 'rate-limited',
			message,
			raw: body,
			...(retryAfterMs !== undefined ? { retryAfterMs } : {})
		};
	}
	if (code === 'content_filter' || type === 'content_filter') {
		return { kind: 'filtered', message, raw: body };
	}
	if (status >= 500) {
		return { kind: 'provider-down', message, raw: body };
	}
	return { kind: 'malformed', message, raw: body };
}

/** A `fetch` that rejected: offline, DNS, or CORS — indistinguishable from here. */
export function normaliseNetworkError(cause: unknown): ProviderError {
	return {
		kind: 'network',
		message: cause instanceof Error ? cause.message : 'The request could not be sent.',
		raw: cause instanceof Error ? { name: cause.name, message: cause.message } : cause
	};
}

/** A 200 whose body we could not make sense of — "the bot mumbled" (03 §9). */
export function normaliseMalformed(message: string, raw: unknown): ProviderError {
	return { kind: 'malformed', message, raw };
}

/** A completion the model itself refused, reported honestly rather than hidden (06 §7). */
export function normaliseFiltered(raw: unknown): ProviderError {
	return {
		kind: 'filtered',
		message: 'The provider declined to answer this prompt.',
		raw
	};
}

function extractDetail(body: unknown): { message?: string; type?: unknown; code?: unknown } {
	if (typeof body !== 'object' || body === null) return {};
	const error = (body as WireErrorBody).error;
	if (typeof error !== 'object' || error === null) return {};
	return {
		...(typeof error.message === 'string' ? { message: error.message } : {}),
		type: error.type,
		code: error.code
	};
}

/** `Retry-After` is seconds or an HTTP date; we only need a rough delay. */
function parseRetryAfter(value: string | null | undefined): number | undefined {
	if (!value) return undefined;
	const seconds = Number(value);
	if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
	const date = Date.parse(value);
	if (Number.isNaN(date)) return undefined;
	return Math.max(0, date - Date.now());
}
