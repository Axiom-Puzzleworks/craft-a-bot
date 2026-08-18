import type { ProviderError, ProviderErrorKind } from '@craftabot/core';

/**
 * The error normalisation table (`06-…` §7), adapted to Anthropic's own error
 * body shape (`{"type":"error","error":{"type":"...","message":"..."}}`)
 * rather than OpenAI's (`{"error":{"message","type","code"}}`).
 *
 * **`scrubKey` is applied unconditionally, same as `pack-openai`**, even
 * without the same live-API proof OpenAI's own comment describes (its 401
 * body was found, live, to quote the rejected key back). Whether Anthropic's
 * does too has not been checked against a real key here — assuming it does
 * not is exactly the mistake that finding was about. Hard rule 2 does not
 * get a pass because nobody has looked yet.
 */

export const KEY_REDACTED = '[key-redacted]';

/** Remove a key from anywhere it appears in a provider error, however deeply. */
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

/** A whole `ProviderError` with the key scrubbed out of every field. */
export function scrubProviderError(error: ProviderError, key: string): ProviderError {
	return { ...error, message: scrubKey(error.message, key), raw: scrubKey(error.raw, key) };
}

/** Typed error object, thrown so stack traces survive (10-CODING-STANDARDS.md §1). */
export class AnthropicError extends Error {
	readonly kind: ProviderErrorKind;
	readonly providerError: ProviderError;

	constructor(providerError: ProviderError) {
		super(providerError.message);
		this.name = 'AnthropicError';
		this.kind = providerError.kind;
		this.providerError = providerError;
	}
}

/** Shape of the `{type:"error", error:{...}}` body Anthropic returns on failure. */
interface WireErrorBody {
	error?: { message?: unknown };
}

export function normaliseHttpError(
	status: number,
	body: unknown,
	headers?: { get(name: string): string | null }
): ProviderError {
	const detail = extractDetail(body);
	const message = detail.message ?? `Anthropic returned ${status}.`;

	// A low-balance account is a 400 `invalid_request_error` — there is no
	// dedicated status or type for it, only the message text, the same
	// heuristic shape OpenAI's own `insufficient_quota` check needed before
	// it had a proper machine-readable field.
	if (status === 400 && /credit balance/i.test(message)) {
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
	// 529 is Anthropic's own "overloaded" status, not the more usual 503.
	if (status >= 500 || status === 529) {
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

/** A completion Claude itself declined, reported honestly rather than hidden (06 §7). */
export function normaliseFiltered(raw: unknown): ProviderError {
	return {
		kind: 'filtered',
		message: 'The provider declined to answer this prompt.',
		raw
	};
}

function extractDetail(body: unknown): { message?: string } {
	if (typeof body !== 'object' || body === null) return {};
	const error = (body as WireErrorBody).error;
	if (typeof error !== 'object' || error === null) return {};
	return typeof error.message === 'string' ? { message: error.message } : {};
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
