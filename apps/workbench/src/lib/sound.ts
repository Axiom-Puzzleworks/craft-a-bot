/**
 * The toy's noises (`04-VISUAL-DESIGN-LANGUAGE.md` §6): "tiny clunk (snap),
 * click (buttons), paper rustle (leaflet), muted fanfare (success). All
 * optional, all skippable." Off by default.
 *
 * ## Synthesised, not sampled — and why that is a compromise
 *
 * There are no audio assets in the repo, and `11-VISUAL-ASSET-MANIFEST.md` is
 * visual-only, so no audio has ever been commissioned. These cues are therefore
 * built from WebAudio oscillator and noise envelopes: a few hundred bytes of
 * code instead of a few hundred kilobytes of samples, and nothing to swap in.
 *
 * Be honest about what that buys. A synthesised "clunk" is a decent stand-in
 * for moulded plastic; a synthesised "paper rustle" is filtered noise and only
 * suggests paper. `playCue` is the seam: replacing these with recordings later
 * changes this file and nothing else.
 *
 * Everything is lazy. No `AudioContext` is constructed until a cue actually
 * plays, so a user who never turns sound on never pays for it, and the module
 * imports safely on a server or in a test.
 */

/**
 * The four original cues are the build ones; the three added in WP17 §2.3 are
 * the moments a run has something to say about itself. All of them stay in the
 * same register — moulded plastic and a muted toy speaker, never a brass band.
 */
export type SoundCue = 'snap' | 'click' | 'rustle' | 'fanfare' | 'badge' | 'ask' | 'stopped';

export interface SoundPlayer {
	readonly enabled: boolean;
	setEnabled(value: boolean): void;
	play(cue: SoundCue): void;
}

/** Injected in tests; the browser supplies the real one. */
export interface AudioContextLike {
	readonly currentTime: number;
	readonly destination: unknown;
	readonly sampleRate: number;
	state: string;
	resume(): Promise<void>;
	createOscillator(): OscillatorLike;
	createGain(): GainLike;
	createBufferSource(): BufferSourceLike;
	createBuffer(channels: number, length: number, rate: number): AudioBufferLike;
	createBiquadFilter(): FilterLike;
}

interface Connectable {
	connect(target: unknown): unknown;
}
interface OscillatorLike extends Connectable {
	type: string;
	frequency: { setValueAtTime(value: number, when: number): void };
	start(when: number): void;
	stop(when: number): void;
}
interface GainLike extends Connectable {
	gain: {
		setValueAtTime(value: number, when: number): void;
		exponentialRampToValueAtTime(value: number, when: number): void;
	};
}
interface BufferSourceLike extends Connectable {
	buffer: AudioBufferLike | null;
	start(when: number): void;
}
interface AudioBufferLike {
	getChannelData(channel: number): Float32Array;
}
interface FilterLike extends Connectable {
	type: string;
	frequency: { setValueAtTime(value: number, when: number): void };
}

export interface SoundDeps {
	enabled?: boolean;
	/** Returns undefined where there is no audio at all (SSR, jsdom). */
	createContext?: () => AudioContextLike | undefined;
}

function browserContext(): AudioContextLike | undefined {
	const Ctor = (globalThis as { AudioContext?: new () => AudioContextLike }).AudioContext;
	return Ctor ? new Ctor() : undefined;
}

export function createSoundPlayer(deps: SoundDeps = {}): SoundPlayer {
	const createContext = deps.createContext ?? browserContext;
	let enabled = deps.enabled ?? false;
	let context: AudioContextLike | undefined;
	let unavailable = false;

	function audio(): AudioContextLike | undefined {
		if (unavailable) return undefined;
		if (!context) {
			context = createContext();
			if (!context) {
				unavailable = true;
				return undefined;
			}
		}
		// Browsers start suspended until a gesture; every cue follows one.
		if (context.state === 'suspended') void context.resume();
		return context;
	}

	/** A pitched blip with an exponential decay — the basis of most cues. */
	function tone(
		ctx: AudioContextLike,
		{
			type,
			from,
			to,
			seconds,
			gain
		}: {
			type: string;
			from: number;
			to: number;
			seconds: number;
			gain: number;
		},
		delay = 0
	): void {
		const at = ctx.currentTime + delay;
		const osc = ctx.createOscillator();
		const amp = ctx.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(from, at);
		osc.frequency.setValueAtTime(to, at + seconds * 0.6);
		amp.gain.setValueAtTime(gain, at);
		// Ramps to a floor rather than zero: exponential ramps cannot reach 0.
		amp.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
		osc.connect(amp);
		amp.connect(ctx.destination);
		osc.start(at);
		osc.stop(at + seconds);
	}

	/** Filtered white noise — as close to paper as arithmetic gets. */
	function noise(ctx: AudioContextLike, seconds: number, cutoff: number, gain: number): void {
		const at = ctx.currentTime;
		const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
		const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		for (let frame = 0; frame < frames; frame++) {
			// Fades out across the buffer so it whispers rather than clicks off.
			data[frame] = (Math.random() * 2 - 1) * (1 - frame / frames);
		}
		const source = ctx.createBufferSource();
		const filter = ctx.createBiquadFilter();
		const amp = ctx.createGain();
		source.buffer = buffer;
		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(cutoff, at);
		amp.gain.setValueAtTime(gain, at);
		source.connect(filter);
		filter.connect(amp);
		amp.connect(ctx.destination);
		source.start(at);
	}

	const CUES: Record<SoundCue, (ctx: AudioContextLike) => void> = {
		// Moulded plastic meeting moulded plastic: low, square, very short.
		snap: (ctx) => tone(ctx, { type: 'square', from: 220, to: 120, seconds: 0.09, gain: 0.16 }),
		click: (ctx) => tone(ctx, { type: 'square', from: 900, to: 700, seconds: 0.035, gain: 0.07 }),
		rustle: (ctx) => noise(ctx, 0.22, 2400, 0.05),
		// A merit badge: two rising notes, pleased rather than triumphant — the
		// fanfare is for finishing, and a badge should not upstage it.
		badge: (ctx) => {
			tone(ctx, { type: 'triangle', from: 659.25, to: 659.25, seconds: 0.12, gain: 0.09 });
			tone(ctx, { type: 'triangle', from: 880, to: 880, seconds: 0.16, gain: 0.09 }, 0.11);
		},
		// Somebody is being asked a question, so it rises and waits.
		ask: (ctx) => tone(ctx, { type: 'sine', from: 440, to: 660, seconds: 0.2, gain: 0.1 }),
		/*
		 * A guardrail stopping the run. Deliberately not a buzzer: the Safety
		 * Brick doing its job is the system working (`08-…` §3), and a child
		 * should not be made to feel told off by the thing that protected them.
		 * Two soft descending notes — a gentle "that's far enough".
		 */
		stopped: (ctx) => {
			tone(ctx, { type: 'triangle', from: 392, to: 392, seconds: 0.14, gain: 0.09 });
			tone(ctx, { type: 'triangle', from: 293.66, to: 293.66, seconds: 0.2, gain: 0.09 }, 0.13);
		},
		// Muted, per the doc — three notes, not a brass band.
		fanfare: (ctx) => {
			const notes = [523.25, 659.25, 783.99];
			notes.forEach((note, index) => {
				tone(
					ctx,
					{ type: 'triangle', from: note, to: note, seconds: 0.18, gain: 0.1 },
					index * 0.1
				);
			});
		}
	};

	return {
		get enabled() {
			return enabled;
		},
		setEnabled(value) {
			enabled = value;
		},
		play(cue) {
			if (!enabled) return;
			const ctx = audio();
			if (!ctx) return;
			try {
				CUES[cue](ctx);
			} catch {
				// A cue that cannot play is never worth interrupting a run for.
				unavailable = true;
			}
		}
	};
}
