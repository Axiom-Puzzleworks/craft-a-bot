/**
 * **Reading the story strip out loud** (`16-…` §1.3).
 *
 * The strip exists because reading is the ceiling for a five-to-eight-year-old.
 * For the youngest of those, pictures are not enough either — so the captions
 * can be spoken, through the Web Speech API the browser already has.
 *
 * **Off by default, and per-profile.** §1.3 says so, and it is the right
 * default for more than politeness: a voice starting unbidden in a classroom of
 * twenty tablets is a bad afternoon, and speech is the kind of thing an adult
 * should turn on deliberately for a particular child.
 *
 * Wrapped rather than called directly for two reasons. It is absent in tests,
 * in server-side rendering and in older browsers, so every call needs guarding
 * somewhere and it may as well be one place; and injecting the synth is what
 * lets the strip's own tests prove *what* would be said without a speech engine
 * anywhere near them.
 */

/** The slice of `SpeechSynthesis` this uses — small enough for a test to stand up. */
export interface SpeechLike {
	speak(utterance: SpeechSynthesisUtterance): void;
	cancel(): void;
}

export interface Narrator {
	/** Say a line, abandoning anything still being said. */
	say(text: string): void;
	/** Stop talking — when a run resets, or the reader turns it off. */
	hush(): void;
	/** Whether this browser can speak at all. */
	readonly available: boolean;
}

/** What the browser offers, or nothing at all. */
function browserSpeech(): SpeechLike | undefined {
	if (typeof window === 'undefined') return undefined;
	return window.speechSynthesis as SpeechLike | undefined;
}

/** A voice that is deliberately unhurried, for a listener who is still learning. */
const RATE = 0.95;
const PITCH = 1.1;

export function createNarrator(synth: SpeechLike | undefined = browserSpeech()): Narrator {
	return {
		get available() {
			return synth !== undefined;
		},

		say(text) {
			const line = text.trim();
			if (!synth || line === '') return;
			/*
			 * Cancel first. Beats arrive a few hundred milliseconds apart at speed,
			 * and a queue would fall further behind the picture with every turn until
			 * the voice was describing something that had scrolled off the strip.
			 * The current beat is the one worth hearing.
			 */
			synth.cancel();

			// `SpeechSynthesisUtterance` is absent wherever `speechSynthesis` is, but
			// guard anyway: a browser with one and not the other should go quiet
			// rather than throw in the middle of a child's turn.
			if (typeof SpeechSynthesisUtterance === 'undefined') return;
			const utterance = new SpeechSynthesisUtterance(line);
			utterance.rate = RATE;
			utterance.pitch = PITCH;
			synth.speak(utterance);
		},

		hush() {
			synth?.cancel();
		}
	};
}
