import { describe, expect, it } from 'vitest';
import { createMemory, type MemoryStrategy, type TickMemory } from './memory.js';
import { sectionsPromptStrategy, transcriptPromptStrategy } from './prompt.js';
import { DEFAULT_STRATEGY, resolveStrategies } from './strategies.js';

/**
 * **The seams are seams** (E7, `12-…` D5).
 *
 * The thing worth testing here is not that `resolveStrategies('transcript')`
 * returns the transcript strategy — that is a lookup table checking itself. It
 * is that a strategy handed *in* is the one actually used, because a hard-coded
 * implementation behind an interface-shaped name passes every test that only
 * ever exercises the default.
 */

function recorder(): MemoryStrategy & { seen: TickMemory[] } {
	const seen: TickMemory[] = [];
	return {
		id: 'counting-fake',
		seen,
		remember: (entry) => void seen.push(entry),
		window: () => [...seen],
		size: () => seen.length
	};
}

const entry = (tick: number): TickMemory => ({ tick, observation: `saw ${tick}`, thought: '' });

describe('resolving the strategy pairing', () => {
	it('defaults to the pairing the kit has always used', () => {
		const strategies = resolveStrategies(undefined, 10);

		expect(DEFAULT_STRATEGY).toBe('window');
		expect(strategies.memory.id).toBe('window-v1');
		expect(strategies.prompt.id).toBe('sections-v1');
	});

	it('pairs the transcript prompt with the same retention', () => {
		const strategies = resolveStrategies('transcript', 10);

		expect(strategies.prompt).toBe(transcriptPromptStrategy);
		// Deliberately the same retention: a transcript differs in how a turn
		// reads, not in which turns survive. See the note in `strategies.ts`.
		expect(strategies.memory.id).toBe('window-v1');
	});

	it('lets a caller override either half without touching the other', () => {
		const fake = recorder();

		const memoryOnly = resolveStrategies('window', 10, { memory: fake });
		expect(memoryOnly.memory).toBe(fake);
		expect(memoryOnly.prompt).toBe(sectionsPromptStrategy);

		const promptOnly = resolveStrategies('window', 10, { prompt: transcriptPromptStrategy });
		expect(promptOnly.memory.id).toBe('window-v1');
		expect(promptOnly.prompt).toBe(transcriptPromptStrategy);
	});
});

describe('the memory strategy seam', () => {
	it('routes everything the agent remembers through the strategy it was given', () => {
		const fake = recorder();
		const memory = createMemory({ windowSize: 3, notebook: false }, fake);

		memory.remember(entry(1));
		memory.remember(entry(2));

		// A ring buffer would have kept both too — what proves the seam is that
		// the *fake* saw them, and that the fake's refusal to truncate wins.
		expect(fake.seen.map((held) => held.tick)).toEqual([1, 2]);
		expect(memory.strategy).toBe(fake);

		memory.remember(entry(3));
		memory.remember(entry(4));
		expect(memory.size()).toBe(4);
		expect(memory.window()).toHaveLength(4);
	});

	it('has no strategy at all when no Memory brick is fitted', () => {
		const memory = createMemory();

		expect(memory.strategy).toBeUndefined();
		expect(memory.enabled).toBe(false);
		memory.remember(entry(1));
		expect(memory.size()).toBe(0);
	});
});
