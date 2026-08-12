import { describe, expect, it, vi } from 'vitest';
import { createSoundPlayer, type AudioContextLike } from './sound.js';

/**
 * Sound (04-VISUAL-DESIGN-LANGUAGE.md §6). The audible result is not testable
 * here; what is testable is the part that matters — that it stays silent unless
 * asked, and that a browser without audio cannot break a run.
 */

function fakeContext(): AudioContextLike & { started: number } {
	const node = { connect: vi.fn() };
	const context = {
		currentTime: 0,
		destination: {},
		sampleRate: 48000,
		state: 'running',
		started: 0,
		resume: vi.fn(() => Promise.resolve()),
		createOscillator: () => ({
			...node,
			type: '',
			frequency: { setValueAtTime: vi.fn() },
			start: () => void (context.started += 1),
			stop: vi.fn()
		}),
		createGain: () => ({
			...node,
			gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }
		}),
		createBufferSource: () => ({
			...node,
			buffer: null,
			start: () => void (context.started += 1)
		}),
		createBuffer: (_channels: number, length: number) => ({
			getChannelData: () => new Float32Array(length)
		}),
		createBiquadFilter: () => ({ ...node, type: '', frequency: { setValueAtTime: vi.fn() } })
	};
	return context as unknown as AudioContextLike & { started: number };
}

describe('staying quiet', () => {
	it('is off by default, as the doc requires', () => {
		const context = fakeContext();
		const player = createSoundPlayer({ createContext: () => context });

		player.play('snap');
		expect(player.enabled).toBe(false);
		expect(context.started).toBe(0);
	});

	it('builds no AudioContext at all until a cue actually plays', () => {
		// A user who never turns sound on should never pay for the audio graph.
		const createContext = vi.fn(fakeContext);
		const player = createSoundPlayer({ createContext });

		player.play('click');
		expect(createContext).not.toHaveBeenCalled();

		player.setEnabled(true);
		player.play('click');
		expect(createContext).toHaveBeenCalledTimes(1);
	});

	it('reuses the one context across cues', () => {
		const createContext = vi.fn(fakeContext);
		const player = createSoundPlayer({ enabled: true, createContext });

		player.play('snap');
		player.play('click');
		expect(createContext).toHaveBeenCalledTimes(1);
	});
});

describe('making a noise', () => {
	it.each(['snap', 'click', 'rustle', 'fanfare'] as const)('plays %s', (cue) => {
		const context = fakeContext();
		createSoundPlayer({ enabled: true, createContext: () => context }).play(cue);
		expect(context.started).toBeGreaterThan(0);
	});

	it('resumes a context the browser suspended', () => {
		const context = fakeContext();
		context.state = 'suspended';
		createSoundPlayer({ enabled: true, createContext: () => context }).play('snap');
		expect(context.resume).toHaveBeenCalled();
	});
});

describe('when there is no audio', () => {
	it('does nothing, quietly, where AudioContext does not exist', () => {
		const player = createSoundPlayer({ enabled: true, createContext: () => undefined });
		expect(() => player.play('fanfare')).not.toThrow();
	});

	it('gives up after a cue throws, rather than throwing every turn', () => {
		const broken = {
			...fakeContext(),
			createOscillator: () => {
				throw new Error('audio hardware went away');
			}
		} as unknown as AudioContextLike;

		const player = createSoundPlayer({ enabled: true, createContext: () => broken });
		expect(() => player.play('snap')).not.toThrow();
		expect(() => player.play('snap')).not.toThrow();
	});
});
