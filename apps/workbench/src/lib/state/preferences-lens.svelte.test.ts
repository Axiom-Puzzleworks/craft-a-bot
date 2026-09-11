import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import type { WebStorageLike } from './keys.js';
import { createPreferences } from './preferences.svelte.js';
import { createSettingsStore } from './settings.js';

/** The lens preference (WP87, `78-LENSES.md` §3): stored, defaulted, and reactive — the rail re-derives when it changes. */
function fakeStore(): WebStorageLike {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}

describe('the lens preference', () => {
	it('defaults to the engineer, persists, and is reactive', () => {
		const storage = fakeStore();
		const prefs = createPreferences(createSettingsStore(storage));
		expect(prefs.lens).toBe('engineer');
		const seen: string[] = [];
		const cleanup = $effect.root(() => {
			const lens = $derived(prefs.lens);
			$effect(() => {
				seen.push(lens);
			});
		});
		flushSync();
		prefs.setLens('assurance');
		flushSync();
		expect(seen).toEqual(['engineer', 'assurance']);
		expect(createSettingsStore(storage).read().lens).toBe('assurance');
		prefs.dismissFirstRun('assurance');
		prefs.dismissFirstRun('assurance');
		expect(prefs.firstRunDismissed).toEqual(['assurance']);
		expect(createSettingsStore(storage).read().firstRunDismissed).toEqual(['assurance']);
		cleanup();
	});
});
