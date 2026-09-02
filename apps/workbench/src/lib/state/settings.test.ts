import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, createSettingsStore } from './settings.js';
import type { WebStorageLike } from './keys.js';

function fakeStore(initial: Record<string, string> = {}): WebStorageLike {
	const map = new Map(Object.entries(initial));
	return {
		getItem: (key) => map.get(key) ?? null,
		setItem: (key, value) => void map.set(key, value),
		removeItem: (key) => void map.delete(key)
	};
}

describe('settings', () => {
	it('starts from sensible defaults — sound off, motion normal', () => {
		const settings = createSettingsStore(fakeStore()).read();
		expect(settings).toEqual(DEFAULT_SETTINGS);
		expect(settings.sound).toBe(false);
		expect(settings.tutorialChapter).toBe(0);
	});

	/** WP36 stage C: the run cap is a preference whose default is the fifty it always was. */
	it('keeps fifty runs by default, and bounds the cap rather than storing nonsense', () => {
		const store = createSettingsStore(fakeStore());
		expect(store.read().runCap).toBe(50);
		expect(store.update({ runCap: 200 }).runCap).toBe(200);
		expect(() => store.update({ runCap: 1 })).toThrow();
		expect(() => store.update({ runCap: 5000 })).toThrow();
		expect(store.read().runCap).toBe(200);
	});

	it('reads a settings row written before the run cap existed as fifty', () => {
		const withoutCap = JSON.stringify({ ...DEFAULT_SETTINGS, runCap: undefined });
		const store = createSettingsStore(fakeStore({ [SETTINGS_STORAGE_KEY]: withoutCap }));
		expect(store.read().runCap).toBe(50);
	});

	it('round-trips a written value', () => {
		const store = createSettingsStore(fakeStore());
		store.write({ ...DEFAULT_SETTINGS, sound: true, tickSpeed: 2 });
		expect(store.read().sound).toBe(true);
		expect(store.read().tickSpeed).toBe(2);
	});

	it('patches one field without disturbing the others', () => {
		const store = createSettingsStore(fakeStore());
		store.update({ sound: true });
		const next = store.update({ tutorialChapter: 3 });

		expect(next.sound).toBe(true);
		expect(next.tutorialChapter).toBe(3);
	});

	it('rejects an out-of-range tick speed rather than storing nonsense', () => {
		const store = createSettingsStore(fakeStore());
		expect(() => store.update({ tickSpeed: 99 })).toThrow();
	});

	it('falls back to defaults on unreadable stored settings', () => {
		const store = createSettingsStore(fakeStore({ [SETTINGS_STORAGE_KEY]: 'not json' }));
		expect(store.read()).toEqual(DEFAULT_SETTINGS);
	});

	it('falls back to defaults on a wrongly-shaped record', () => {
		const store = createSettingsStore(
			fakeStore({ [SETTINGS_STORAGE_KEY]: '{"tickSpeed":"fast"}' })
		);
		expect(store.read()).toEqual(DEFAULT_SETTINGS);
	});

	it('collects merit badges', () => {
		const store = createSettingsStore(fakeStore());
		store.update({ badges: ['first-bot', 'first-snack'] });
		expect(store.read().badges).toEqual(['first-bot', 'first-snack']);
	});

	it('clears back to defaults', () => {
		const store = createSettingsStore(fakeStore());
		store.update({ sound: true });
		store.clear();
		expect(store.read()).toEqual(DEFAULT_SETTINGS);
	});
});
