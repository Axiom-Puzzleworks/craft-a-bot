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
	/**
	 * Read the story strip aloud (`16-…` §1.3).
	 *
	 * Off by default and deliberately so: a voice starting unbidden in a
	 * classroom of twenty tablets is a bad afternoon, and speech is something an
	 * adult should switch on for a particular child.
	 */
	readAloud: z.boolean().default(false),
	/** Playroom tick speed multiplier (03-UI-UX-DESIGN.md §5.1). */
	tickSpeed: z.number().min(0.5).max(4).default(1),
	/**
	 * Whether the Workshop is reachable from the nav (`15-…` §2).
	 *
	 * "A profile-level choice with per-surface escape hatches", and **off by
	 * default on purpose**: children must never fall into the Workshop by
	 * accident. It gates the *door*, not the routes — a `/workshop` URL someone
	 * has been sent still opens, because a link that silently does nothing is
	 * worse than one that opens something unexpected, and an adult who was given
	 * the link meant to follow it.
	 */
	workshop: z.boolean().default(false),
	/**
	 * How many runs the scrapbook keeps before tidying the oldest away
	 * (WP36 stage C, `26-…` §6.14). `07-…` §2's cap of 50 was a constant; a
	 * practitioner running an experiment corpus needs more, and the store's
	 * own `DEFAULT_RUN_CAP` stays the default so a child's scrapbook behaves
	 * exactly as before. Set from the Workshop's own preferences; pinned and
	 * grouped runs never count against it either way.
	 */
	runCap: z.number().int().min(5).max(500).default(50),
	/**
	 * Highest instruction-leaflet chapter completed, 0 = not started.
	 *
	 * No upper bound on purpose (`WP30 stage D`, after `.max(6)` was found to
	 * throw the moment a reader finished the leaflet's new eighth chapter):
	 * `chapterByNumber` already treats a number past the end as "no such
	 * chapter", the same way `LeafletController.complete` already compares
	 * against `CHAPTERS.length` rather than a literal. A cap here would only
	 * ever be a second count to keep in step with the first, and `update()`
	 * uses `.parse()`, not `.safeParse()` — a value the schema rejects throws
	 * inside the same synchronous call that would otherwise award the badge.
	 */
	tutorialChapter: z.number().int().min(0).default(0),
	/**
	 * Set by "I've built kits before" (03 §6). Kept separate from
	 * `tutorialChapter` so skipping does not pretend the chapters were done —
	 * the badges page should stay honestly empty, and the Instructions handle
	 * still reopens the leaflet at chapter one.
	 */
	tutorialSkipped: z.boolean().default(false),
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
