import { describe, expect, it } from 'vitest';
import type { WebStorageLike } from './keys.js';
import { createPreferences } from './preferences.svelte.js';
import { createSettingsStore } from './settings.js';

/**
 * Preferences (03-UI-UX-DESIGN.md §7). The settings schema has carried these
 * since WP4; until WP9 nothing read them, so these tests are about the wiring
 * rather than the storage.
 */

function fakeStore(): WebStorageLike {
	const map = new Map<string, string>();
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}

describe('preferences', () => {
	it('starts from the stored settings', () => {
		const storage = fakeStore();
		createSettingsStore(storage).update({ reducedMotion: true, tickSpeed: 2 });

		const prefs = createPreferences(createSettingsStore(storage));
		expect(prefs.reducedMotion).toBe(true);
		expect(prefs.tickSpeed).toBe(2);
	});

	it('defaults to full motion at normal speed', () => {
		const prefs = createPreferences(createSettingsStore(fakeStore()));
		expect(prefs.reducedMotion).toBe(false);
		expect(prefs.tickSpeed).toBe(1);
	});

	it('persists a change so the next visit keeps it', () => {
		const storage = fakeStore();
		const prefs = createPreferences(createSettingsStore(storage));

		prefs.setReducedMotion(true);
		prefs.setTickSpeed(4);

		expect(prefs.reducedMotion).toBe(true);
		expect(createSettingsStore(storage).read().reducedMotion).toBe(true);
		expect(createSettingsStore(storage).read().tickSpeed).toBe(4);
	});
});
