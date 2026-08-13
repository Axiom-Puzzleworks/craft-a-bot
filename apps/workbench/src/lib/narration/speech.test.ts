import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createNarrator, type SpeechLike } from './speech.js';

/**
 * The speech wrapper (`16-…` §1.3). Tested against an injected synth, which is
 * the reason it is wrapped at all: what would be said is checkable without a
 * speech engine anywhere near the suite.
 */

/**
 * jsdom ships no speech API at all — neither `speechSynthesis` nor
 * `SpeechSynthesisUtterance`. That is itself worth knowing: without this stub
 * the narrator correctly goes silent, which is exactly what the "no voice"
 * cases below assert. The stub is what lets the *other* half be tested.
 */
class StubUtterance {
	rate = 1;
	pitch = 1;
	constructor(public text: string) {}
}

beforeAll(() => {
	globalThis.SpeechSynthesisUtterance = StubUtterance as unknown as typeof SpeechSynthesisUtterance;
});

afterAll(() => {
	// @ts-expect-error — putting the environment back as jsdom had it.
	delete globalThis.SpeechSynthesisUtterance;
});

function fakeSynth() {
	const spoken: string[] = [];
	const synth: SpeechLike & { spoken: string[]; cancels: number } = {
		spoken,
		cancels: 0,
		speak: (utterance) => void spoken.push(utterance.text),
		cancel: () => void (synth.cancels += 1)
	};
	return synth;
}

describe('a narrator with a voice', () => {
	it('says what it is given', () => {
		const synth = fakeSynth();
		createNarrator(synth).say('Teddy is to the east.');
		expect(synth.spoken).toEqual(['Teddy is to the east.']);
	});

	/**
	 * Beats arrive a few hundred milliseconds apart at speed. A queue would fall
	 * further behind the picture every turn until the voice was describing
	 * something that had scrolled off the strip.
	 */
	it('abandons the last line rather than queueing behind it', () => {
		const synth = fakeSynth();
		const narrator = createNarrator(synth);
		narrator.say('First.');
		narrator.say('Second.');
		expect(synth.cancels).toBe(2);
		expect(synth.spoken).toEqual(['First.', 'Second.']);
	});

	it('says nothing about nothing', () => {
		const synth = fakeSynth();
		createNarrator(synth).say('   ');
		expect(synth.spoken).toEqual([]);
	});

	it('stops when hushed', () => {
		const synth = fakeSynth();
		createNarrator(synth).hush();
		expect(synth.cancels).toBe(1);
	});

	it('knows it can speak', () => {
		expect(createNarrator(fakeSynth()).available).toBe(true);
	});
});

describe('a browser with no voice', () => {
	/**
	 * Absent in tests, in server rendering, and in older browsers. Every call
	 * needs guarding somewhere, and one place is better than each call site.
	 */
	it('goes quiet rather than throwing', () => {
		const narrator = createNarrator(undefined);
		expect(narrator.available).toBe(false);
		expect(() => narrator.say('Anything at all.')).not.toThrow();
		expect(() => narrator.hush()).not.toThrow();
	});

	/** A browser with `speechSynthesis` but no `SpeechSynthesisUtterance`. */
	it('goes quiet when it cannot build an utterance', () => {
		const synth = fakeSynth();
		const original = globalThis.SpeechSynthesisUtterance;
		// @ts-expect-error — deliberately removing it, which is the case under test.
		delete globalThis.SpeechSynthesisUtterance;
		try {
			expect(() => createNarrator(synth).say('Hello.')).not.toThrow();
			expect(synth.spoken).toEqual([]);
		} finally {
			globalThis.SpeechSynthesisUtterance = original;
		}
	});
});

describe('the voice it uses', () => {
	it('is unhurried, for a listener who is still learning', () => {
		const synth = fakeSynth();
		const speak = vi.spyOn(synth, 'speak');
		createNarrator(synth).say('Off we go.');

		const utterance = speak.mock.calls[0]?.[0];
		expect(utterance?.rate).toBeLessThan(1);
		expect(utterance?.pitch).toBeGreaterThan(1);
	});
});
