/**
 * Model Armor's failure kinds, closed to the six named throughout `25-…`
 * (§4.4's verdict table, §12 acceptance criterion 3): `bad-token`,
 * `no-permission`, `no-template`, `quota`, `timeout`, `unavailable`. Every
 * transport/auth failure the client can observe collapses into one of these
 * — nothing here is a `throw`; `client.ts` returns `{error}` and
 * `guardrails.ts` routes it through the `onFailure` dial, same as a `partial`
 * or `failure` reading (`25-…` §4.4).
 */

export type ArmorErrorKind =
	'bad-token' | 'no-permission' | 'no-template' | 'quota' | 'timeout' | 'unavailable';

export interface ArmorError {
	kind: ArmorErrorKind;
	message: string;
}

export const TOKEN_REDACTED = '[token-redacted]';

/** Remove a bearer token from anywhere it appears, however deeply nested — same discipline as `pack-gemini/errors.ts`'s `scrubKey`. */
export function scrubToken<T>(value: T, token: string): T {
	if (token.trim() === '') return value;
	if (typeof value === 'string') return value.split(token).join(TOKEN_REDACTED) as T;
	if (Array.isArray(value)) return value.map((entry) => scrubToken(entry, token)) as T;
	if (value instanceof Error) {
		const copy = new Error(scrubToken(value.message, token));
		copy.name = value.name;
		return copy as T;
	}
	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [name, entry] of Object.entries(value)) result[name] = scrubToken(entry, token);
		return result as T;
	}
	return value;
}

/** Maps an HTTP failure status onto the closed error-kind set. */
export function armorErrorFromStatus(status: number, message: string): ArmorError {
	if (status === 401) return { kind: 'bad-token', message };
	if (status === 403) return { kind: 'no-permission', message };
	if (status === 404) return { kind: 'no-template', message };
	if (status === 429) return { kind: 'quota', message };
	return { kind: 'unavailable', message };
}

/** A `fetch` that rejected (offline, DNS, CORS) or a body that made no sense. */
export function armorErrorFromNetworkFailure(cause: unknown): ArmorError {
	return {
		kind: 'unavailable',
		message: cause instanceof Error ? cause.message : 'The request could not be sent.'
	};
}

/** `AbortController` fired at `timeoutMs` before a response arrived. */
export function armorErrorFromTimeout(timeoutMs: number): ArmorError {
	return { kind: 'timeout', message: `The guard did not answer within ${timeoutMs} ms.` };
}
