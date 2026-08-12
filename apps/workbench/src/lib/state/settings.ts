import { z } from 'zod';
import type { WebStorageLike } from './keys.js';

/**
 * Preferences, tutorial progress, and merit badges (07-DATA-MODEL-PERSISTENCE.md §2).
 * Small enough for `localStorage`, and losing it costs the user nothing they
 * cannot set again — so unlike the stores in storage.ts, a read failure here
 * just yields the defaults.
 */

export const SETTINGS_STORAGE_KEY = 'cab.settings.v1';

export const settingsSchema = z.object({
	sound: z.boolean().default(false),
	reducedMotion: z.boolean().default(false),
	/** Playroom tick speed multiplier (03-UI-UX-DESIGN.md §5.1). */
	tickSpeed: z.number().min(0.5).max(4).default(1),
	/** Highest instruction-leaflet chapter completed, 0 = not started. */
	tutorialChapter: z.number().int().min(0).max(6).default(0),
	badges: z.array(z.string()).default([]),
	schemaVersion: z.literal(1).default(1)
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

export interface SettingsStore {
	read(): Settings;
	write(settings: Settings): void;
	update(patch: Partial<Settings>): Settings;
	clear(): void;
}

export function createSettingsStore(store: WebStorageLike): SettingsStore {
	function read(): Settings {
		const raw = store.getItem(SETTINGS_STORAGE_KEY);
		if (raw === null) return { ...DEFAULT_SETTINGS };
		try {
			const parsed = settingsSchema.safeParse(JSON.parse(raw));
			// Unknown or outdated settings fall back to defaults rather than
			// blocking the app on a preference nobody will miss.
			return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}

	function write(settings: Settings): void {
		store.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
	}

	return {
		read,
		write,
		update(patch) {
			const next = settingsSchema.parse({ ...read(), ...patch });
			write(next);
			return next;
		},
		clear: () => store.removeItem(SETTINGS_STORAGE_KEY)
	};
}
