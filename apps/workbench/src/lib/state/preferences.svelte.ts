import { createSettingsStore, type SettingsStore } from './settings.js';
import type { WebStorageLike } from './keys.js';
import { createSoundPlayer, type SoundCue, type SoundPlayer } from '../sound.js';

/**
 * Reactive preferences (03-UI-UX-DESIGN.md §7).
 *
 * `settings.ts` has held these since WP4 and, until WP9, **nothing read any of
 * them** — the schema was there, the store was tested, and the app ignored the
 * result. This is the thin reactive layer that finally connects them.
 *
 * Every preference here does something. `sound` was withheld in WP9 precisely
 * because nothing made a noise yet; WP10 adds the cues, so the switch is real
 * and appears alongside the others.
 */

const noStorage: WebStorageLike = {
	getItem: () => null,
	setItem: () => {},
	removeItem: () => {}
};

/**
 * The four values are `readonly` because every implementation exposes them as
 * getters, so an assignment does nothing at best. The interface used to declare
 * them mutable, which let `preferences.tickSpeed = 2` compile happily and then
 * silently fail to persist anything — go through the setters, which also write
 * to storage.
 */
export interface Preferences {
	readonly reducedMotion: boolean;
	readonly tickSpeed: number;
	readonly sound: boolean;
	/** Whether the story strip is read aloud (`16-…` §1.3). */
	readonly readAloud: boolean;
	/** Whether the Workshop door is shown in the nav (`15-…` §2). */
	readonly workshop: boolean;
	setReducedMotion(value: boolean): void;
	setTickSpeed(value: number): void;
	setSound(value: boolean): void;
	setReadAloud(value: boolean): void;
	setWorkshop(value: boolean): void;
	/** Play a cue, if sound is on. Safe to call from anywhere. */
	cue(name: SoundCue): void;
}

export function createPreferences(store?: SettingsStore, player?: SoundPlayer): Preferences {
	const settings =
		store ?? createSettingsStore(typeof localStorage === 'undefined' ? noStorage : localStorage);
	const initial = settings.read();
	const sound = player ?? createSoundPlayer({ enabled: initial.sound });
	sound.setEnabled(initial.sound);

	const state = $state({
		reducedMotion: initial.reducedMotion,
		tickSpeed: initial.tickSpeed,
		sound: initial.sound,
		readAloud: initial.readAloud,
		workshop: initial.workshop
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
		},
		get sound() {
			return state.sound;
		},
		setSound(value) {
			state.sound = value;
			sound.setEnabled(value);
			settings.update({ sound: value });
			// Play the click that turned it on, so the switch demonstrates itself.
			if (value) sound.play('click');
		},
		get readAloud() {
			return state.readAloud;
		},
		setReadAloud(value) {
			state.readAloud = value;
			settings.update({ readAloud: value });
		},
		get workshop() {
			return state.workshop;
		},
		setWorkshop(value) {
			state.workshop = value;
			settings.update({ workshop: value });
		},
		cue(name) {
			sound.play(name);
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
	get sound() {
		return (shared ??= createPreferences()).sound;
	},
	get readAloud() {
		return (shared ??= createPreferences()).readAloud;
	},
	get workshop() {
		return (shared ??= createPreferences()).workshop;
	},
	setReducedMotion: (value) => (shared ??= createPreferences()).setReducedMotion(value),
	setTickSpeed: (value) => (shared ??= createPreferences()).setTickSpeed(value),
	setSound: (value) => (shared ??= createPreferences()).setSound(value),
	setReadAloud: (value) => (shared ??= createPreferences()).setReadAloud(value),
	setWorkshop: (value) => (shared ??= createPreferences()).setWorkshop(value),
	cue: (name) => (shared ??= createPreferences()).cue(name)
};
