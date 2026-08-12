/**
 * Defence in depth for hard rule 2 (keys are sacred).
 *
 * **This is the second line of defence, not the first.** The real guarantee is
 * that an API key never enters an event, a spec, or a record at all — keys are
 * read only inside provider packs at call time (06-LLM-PROVIDERS.md §6). This
 * scrub exists because "never" is a claim that deserves a backstop, and because
 * `07-DATA-MODEL-PERSISTENCE.md` §5 requires exports to pass through one.
 *
 * Deliberately an exact-match scrub rather than a pattern match: guessing at
 * what a key looks like would both miss real keys and mangle innocent text.
 */

export const REDACTED = '[key-redacted]';

/**
 * Returns a deep copy of `value` with any string exactly equal to one of
 * `secrets` replaced. Empty and whitespace-only secrets are ignored, so an
 * unset key cannot blank out every empty string in the export.
 */
export function redactSecrets<T>(value: T, secrets: readonly string[]): T {
	const targets = secrets.filter((secret) => secret.trim() !== '');
	if (targets.length === 0) return structuredClone(value);
	return scrub(value, new Set(targets)) as T;
}

function scrub(value: unknown, secrets: ReadonlySet<string>): unknown {
	if (typeof value === 'string') {
		return secrets.has(value) ? REDACTED : value;
	}
	if (Array.isArray(value)) {
		return value.map((entry) => scrub(entry, secrets));
	}
	if (value !== null && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			result[key] = scrub(entry, secrets);
		}
		return result;
	}
	return value;
}

/** True when any secret appears anywhere in `value`, at any depth. Used by the CI leak test. */
export function containsSecret(value: unknown, secrets: readonly string[]): boolean {
	const targets = secrets.filter((secret) => secret.trim() !== '');
	if (targets.length === 0) return false;
	const serialised = JSON.stringify(value) ?? '';
	return targets.some((secret) => serialised.includes(secret));
}
