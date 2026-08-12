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

export interface Preferences {
	reducedMotion: boolean;
	tickSpeed: number;
	sound: boolean;
	setReducedMotion(value: boolean): void;
	setTickSpeed(value: number): void;
	setSound(value: boolean): void;
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
		sound: initial.sound
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
	setReducedMotion: (value) => (shared ??= createPreferences()).setReducedMotion(value),
	setTickSpeed: (value) => (shared ??= createPreferences()).setTickSpeed(value),
	setSound: (value) => (shared ??= createPreferences()).setSound(value),
	cue: (name) => (shared ??= createPreferences()).cue(name)
};
