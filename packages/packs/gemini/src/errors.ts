import type { ProviderError, ProviderErrorKind } from '@craftabot/core';

/**
 * The error normalisation table (`06-…` §7), adapted to Gemini's own error
 * body shape (`{"error":{"code","message","status"}}`) — a third shape again,
 * closer to OpenAI's in having a machine-readable classifier than
 * Anthropic's, but its own vocabulary (`RESOURCE_EXHAUSTED`, not
 * `rate_limit_error`).
 *
 * `scrubKey` is applied unconditionally, same as the other two provider
 * packs — see `pack-anthropic/errors.ts`'s comment on why "not proven live"
 * is not a reason to skip it.
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
export class GeminiError extends Error {
	readonly kind: ProviderErrorKind;
	readonly providerError: ProviderError;

	constructor(providerError: ProviderError) {
		super(providerError.message);
		this.name = 'GeminiError';
		this.kind = providerError.kind;
		this.providerError = providerError;
	}
}

/** Shape of the `{error:{code,message,status}}` body Gemini returns on failure. */
interface WireErrorBody {
	error?: { message?: unknown; status?: unknown };
}

export function normaliseHttpError(
	status: number,
	body: unknown,
	headers?: { get(name: string): string | null }
): ProviderError {
	const detail = extractDetail(body);
	const geminiStatus = String(detail.status ?? '');
	const message = detail.message ?? `Gemini returned ${status}.`;

	if (
		geminiStatus === 'UNAUTHENTICATED' ||
		geminiStatus === 'PERMISSION_DENIED' ||
		status === 401 ||
		status === 403
	) {
		return { kind: 'bad-key', message, raw: body };
	}
	if (geminiStatus === 'RESOURCE_EXHAUSTED' || status === 429) {
		// Gemini does not distinguish "too fast" from "out of quota" by
		// status — only the message text says which, the same heuristic
		// gap `pack-anthropic`'s own credit-balance check papers over.
		if (/quota|billing/i.test(message)) return { kind: 'quota', message, raw: body };
		const retryAfterMs = parseRetryAfter(headers?.get('retry-after'));
		return {
			kind: 'rate-limited',
			message,
			raw: body,
			...(retryAfterMs !== undefined ? { retryAfterMs } : {})
		};
	}
	if (geminiStatus === 'UNAVAILABLE' || geminiStatus === 'INTERNAL' || status >= 500) {
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

/** A completion Gemini itself blocked (`finishReason: 'SAFETY'`/`'RECITATION'`). */
export function normaliseFiltered(raw: unknown): ProviderError {
	return {
		kind: 'filtered',
		message: 'The provider declined to answer this prompt.',
		raw
	};
}

function extractDetail(body: unknown): { message?: string; status?: unknown } {
	if (typeof body !== 'object' || body === null) return {};
	const error = (body as WireErrorBody).error;
	if (typeof error !== 'object' || error === null) return {};
	return {
		...(typeof error.message === 'string' ? { message: error.message } : {}),
		status: error.status
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
