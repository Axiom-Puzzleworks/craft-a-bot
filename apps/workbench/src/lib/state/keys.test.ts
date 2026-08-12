import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	KEYS_STORAGE_KEY,
	createBrowserKeyVault,
	createKeyVault,
	type WebStorageLike
} from './keys.js';

function fakeStore(
	initial: Record<string, string> = {}
): WebStorageLike & { raw(): Map<string, string> } {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key),
		raw: () => map
	};
}

describe('the battery vault', () => {
	it('stores and returns a key', () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', 'sk-abc');
		expect(vault.get('openai')).toBe('sk-abc');
	});

	it('keeps keys under the documented localStorage slot (07 §2)', () => {
		const store = fakeStore();
		createKeyVault(store).set('openai', 'sk-abc');
		expect(store.raw().has(KEYS_STORAGE_KEY)).toBe(true);
	});

	it('is undefined for a provider with no battery', () => {
		expect(createKeyVault(fakeStore()).get('openai')).toBeUndefined();
	});

	it('trims surrounding whitespace, which pasted keys often carry', () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', '  sk-abc\n');
		expect(vault.get('openai')).toBe('sk-abc');
	});

	it('treats setting an empty key as ejecting the battery', () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', 'sk-abc');
		vault.set('openai', '   ');
		expect(vault.get('openai')).toBeUndefined();
	});

	it('ejects a battery on request, leaving others alone', () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', 'sk-abc');
		vault.set('anthropic', 'sk-def');
		vault.remove('openai');

		expect(vault.get('openai')).toBeUndefined();
		expect(vault.get('anthropic')).toBe('sk-def');
	});

	it('lists provider ids but never the keys themselves', () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', 'sk-abc');
		expect(vault.providers()).toEqual(['openai']);
		expect(JSON.stringify(vault.providers())).not.toContain('sk-abc');
	});

	it('exposes stored keys only through secrets(), for the export scrub', () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', 'sk-abc');
		vault.set('anthropic', 'sk-def');
		expect(vault.secrets().sort()).toEqual(['sk-abc', 'sk-def']);
	});

	it('removes the storage slot entirely once the last key goes', () => {
		const store = fakeStore();
		const vault = createKeyVault(store);
		vault.set('openai', 'sk-abc');
		vault.remove('openai');
		expect(store.raw().has(KEYS_STORAGE_KEY)).toBe(false);
	});

	it('forgets everything on clear (the settings "forget everything" path)', () => {
		const vault = createKeyVault(fakeStore());
		vault.set('openai', 'sk-abc');
		vault.clear();
		expect(vault.providers()).toEqual([]);
	});

	it('treats a corrupt vault as no batteries, rather than crashing', () => {
		const vault = createKeyVault(fakeStore({ [KEYS_STORAGE_KEY]: 'not json at all' }));
		expect(vault.providers()).toEqual([]);
		expect(vault.get('openai')).toBeUndefined();
	});

	it('treats a wrongly-shaped vault as no batteries', () => {
		const vault = createKeyVault(fakeStore({ [KEYS_STORAGE_KEY]: '{"openai": 42}' }));
		expect(vault.providers()).toEqual([]);
	});

	it('reads through to storage each time, so it holds no copy of a key', () => {
		const store = fakeStore();
		const vault = createKeyVault(store);
		vault.set('openai', 'sk-abc');
		store.raw().delete(KEYS_STORAGE_KEY);
		expect(vault.get('openai')).toBeUndefined();
	});
});

describe('the browser-backed vault', () => {
	afterEach(() => {
		// Unstub first: a test may have replaced localStorage with undefined.
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it('persists through localStorage under the documented slot', () => {
		const vault = createBrowserKeyVault();
		vault.set('openai', 'sk-browser');

		expect(localStorage.getItem(KEYS_STORAGE_KEY)).toContain('sk-browser');
		expect(createBrowserKeyVault().get('openai')).toBe('sk-browser');
	});

	it('degrades to a throwaway store when there is no localStorage at all', () => {
		vi.stubGlobal('localStorage', undefined);
		const vault = createBrowserKeyVault();

		// Still usable for the session; simply not persisted anywhere.
		vault.set('openai', 'sk-ephemeral');
		expect(vault.get('openai')).toBe('sk-ephemeral');
		vault.remove('openai');
		expect(vault.providers()).toEqual([]);
	});
});
