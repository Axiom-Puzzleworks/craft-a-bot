import { z } from 'zod';

/**
 * The battery vault (06-LLM-PROVIDERS.md §6). Hard rule 2: keys live **only**
 * here, are read only by provider packs at call time, and never appear in kit
 * files, traces, events, exports, errors, logs, or URLs.
 *
 * Stored in plaintext in `localStorage`, and the battery-compartment copy says
 * so plainly: client-side encryption with no user secret would be theatre, and
 * V1 has no backend to hold anything safer.
 *
 * Everything in this module is deliberately small and boring. It is the one
 * place in the app allowed to hold a secret, so it should be easy to audit at a
 * glance — no caching, no cloning into other structures, no logging.
 */

export const KEYS_STORAGE_KEY = 'cab.keys.v1';

/**
 * A vault entry (WP41, `26-…` §6.11): the secret, and — for a timed
 * credential, an OAuth token say — when it stops working, as epoch ms. A
 * bare string is the pre-WP41 shape and still reads; it is written back
 * only for an untimed entry, so nothing on disk changes for anyone who has
 * no timed credential.
 */
export const keyVaultEntrySchema = z.union([
	z.string(),
	z.object({ secret: z.string(), expiresAt: z.number().optional() })
]);
const keyVaultSchema = z.record(z.string(), keyVaultEntrySchema);
export type KeyVaultContents = z.infer<typeof keyVaultSchema>;

function secretOf(entry: KeyVaultContents[string] | undefined): string | undefined {
	if (entry === undefined) return undefined;
	return typeof entry === 'string' ? entry : entry.secret;
}

function expiryOf(entry: KeyVaultContents[string] | undefined): number | undefined {
	return entry !== undefined && typeof entry !== 'string' ? entry.expiresAt : undefined;
}

/**
 * The slice of `localStorage` this needs. Named explicitly so it cannot be
 * confused with this app's own `Storage` interface in storage.ts.
 */
export interface WebStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface KeyVault {
	get(providerId: string): string | undefined;
	/** When a timed credential stops working, as epoch ms — `undefined` for an untimed one or an empty slot. */
	expiry(providerId: string): number | undefined;
	set(providerId: string, key: string, expiresAt?: number): void;
	/** Eject the battery: forget the key and any cached validation. */
	remove(providerId: string): void;
	/** Provider ids that currently hold a key — never the keys themselves. */
	providers(): string[];
	/** Every stored key, for the export redaction pass only (07 §5). */
	secrets(): string[];
	clear(): void;
}

export function createKeyVault(store: WebStorageLike): KeyVault {
	function read(): KeyVaultContents {
		const raw = store.getItem(KEYS_STORAGE_KEY);
		if (raw === null) return {};
		try {
			const parsed = keyVaultSchema.safeParse(JSON.parse(raw));
			return parsed.success ? parsed.data : {};
		} catch {
			// A corrupt vault means no batteries, not a broken app.
			return {};
		}
	}

	function write(contents: KeyVaultContents): void {
		if (Object.keys(contents).length === 0) store.removeItem(KEYS_STORAGE_KEY);
		else store.setItem(KEYS_STORAGE_KEY, JSON.stringify(contents));
	}

	return {
		get: (providerId) => secretOf(read()[providerId]),
		expiry: (providerId) => expiryOf(read()[providerId]),
		set(providerId, key, expiresAt) {
			const trimmed = key.trim();
			const contents = read();
			if (trimmed === '') delete contents[providerId];
			else
				contents[providerId] = expiresAt === undefined ? trimmed : { secret: trimmed, expiresAt };
			write(contents);
		},
		remove(providerId) {
			const contents = read();
			delete contents[providerId];
			write(contents);
		},
		providers: () => Object.keys(read()),
		secrets: () =>
			Object.values(read()).map((entry) => (typeof entry === 'string' ? entry : entry.secret)),
		clear: () => store.removeItem(KEYS_STORAGE_KEY)
	};
}

/** The browser-backed vault. Falls back to a throwaway store when there is no `localStorage`. */
export function createBrowserKeyVault(): KeyVault {
	return createKeyVault(typeof localStorage === 'undefined' ? createNullStore() : localStorage);
}

function createNullStore(): WebStorageLike {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}
