import { createSettingsStore, type SettingsStore } from './settings.js';
import type { WebStorageLike } from './keys.js';

/**
 * Reactive preferences (03-UI-UX-DESIGN.md §7).
 *
 * `settings.ts` has held these since WP4 and, until WP9, **nothing read any of
 * them** — the schema was there, the store was tested, and the app ignored the
 * result. This is the thin reactive layer that finally connects them.
 *
 * Only the preferences that actually do something live here. `sound` is stored
 * by the schema but deliberately not surfaced: audio arrives with WP10, and a
 * switch that controls nothing is a lie about what the product does (a dated
 * note records that in `03` §7).
 */

const noStorage: WebStorageLike = {
	getItem: () => null,
	setItem: () => {},
	removeItem: () => {}
};

export interface Preferences {
	reducedMotion: boolean;
	tickSpeed: number;
	setReducedMotion(value: boolean): void;
	setTickSpeed(value: number): void;
}

export function createPreferences(store?: SettingsStore): Preferences {
	const settings =
		store ?? createSettingsStore(typeof localStorage === 'undefined' ? noStorage : localStorage);
	const initial = settings.read();

	const state = $state({
		reducedMotion: initial.reducedMotion,
		tickSpeed: initial.tickSpeed
	});

	return {
		get reducedMotion() {
			return state.reducedMotion;
		},
		get tickSpeed() {
			return state.tickSpeed;
		},
		setReducedMotion(value) {
			state.reducedMotion = value;
			settings.update({ reducedMotion: value });
		},
		setTickSpeed(value) {
			state.tickSpeed = value;
			settings.update({ tickSpeed: value });
		}
	};
}

/** The app's preferences. Tests build their own with `createPreferences`. */
let shared: Preferences | undefined;

export const preferences: Preferences = {
	get reducedMotion() {
		return (shared ??= createPreferences()).reducedMotion;
	},
	get tickSpeed() {
		return (shared ??= createPreferences()).tickSpeed;
	},
	setReducedMotion: (value) => (shared ??= createPreferences()).setReducedMotion(value),
	setTickSpeed: (value) => (shared ??= createPreferences()).setTickSpeed(value)
};
