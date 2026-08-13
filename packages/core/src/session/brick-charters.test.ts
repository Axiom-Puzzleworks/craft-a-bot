import { describe, expect, it } from 'vitest';
import { createMemory, summariseWindow, type TickMemory } from './memory.js';

/**
 * **Brain and Memory unit charters** (`13-…` §4.1–4.2) — the gaps the existing
 * suites leave. The half-built brain state and the token-starvation cycle live
 * in `agent-session.test.ts` beside the rest of the loop; what belongs here is
 * the Memory brick's own arithmetic, which nothing else pins.
 */

function entry(tick: number): TickMemory {
	return { tick, observation: `saw ${tick}`, thought: `thought ${tick}` };
}

describe('the memory window', () => {
	it('never exceeds its size, however much is pushed at it', () => {
		// The property the ring buffer exists to guarantee, checked across every
		// legal window size rather than the one somebody happened to pick.
		for (const windowSize of [3, 10, 30]) {
			const memory = createMemory({ windowSize, notebook: false });
			for (let tick = 1; tick <= windowSize * 3; tick++) {
				memory.remember(entry(tick));
				expect(memory.window().length, `size ${windowSize} at tick ${tick}`).toBeLessThanOrEqual(
					windowSize
				);
				expect(memory.size()).toBe(memory.window().length);
			}
		}
	});

	it('keeps the newest entries, oldest first, at every point', () => {
		const memory = createMemory({ windowSize: 3, notebook: false });
		for (let tick = 1; tick <= 10; tick++) {
			memory.remember(entry(tick));
			const ticks = memory.window().map((held) => held.tick);
			// Oldest first, contiguous, ending at the tick just remembered.
			expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
			expect(ticks.at(-1)).toBe(tick);
			expect(ticks.at(0)).toBe(Math.max(1, tick - ticks.length + 1));
		}
	});

	it('hands back a copy, so a caller cannot rewrite history', () => {
		const memory = createMemory({ windowSize: 3, notebook: false });
		memory.remember(entry(1));
		const stolen = memory.window();
		stolen.push(entry(99));
		stolen[0] = entry(50);
		expect(memory.window().map((held) => held.tick)).toEqual([1]);
	});

	/**
	 * `13-…` §4.2 asks that `createMemory` accept only spec-legal window sizes.
	 * It does not check: the parameter is a plain `number` while the spec says
	 * `3 | 10 | 30` (`12-…` D5), so an out-of-range size produces a working but
	 * unspecified memory rather than an error.
	 *
	 * Pinned rather than marked test-first, because the guarantee is real where
	 * it matters — `agentSpecSchema` rejects any other size at the storage and
	 * kit-file boundary, which is the only way a value reaches here from
	 * outside. E7's `MemoryStrategy` (`14-…` §3) is where the internal signature
	 * gets tightened to match.
	 */
	it('trusts its caller about the window size, because the schema has already checked', () => {
		const memory = createMemory({ windowSize: 7, notebook: false });
		for (let tick = 1; tick <= 9; tick++) memory.remember(entry(tick));
		expect(memory.window()).toHaveLength(7);
	});
});

describe('the notebook', () => {
	it('is absent unless asked for, and silently ignores writes when absent', () => {
		const memory = createMemory({ windowSize: 3, notebook: false });
		memory.notebook.append('a secret');
		expect(memory.notebookEnabled).toBe(false);
		expect(memory.notebook.read()).toEqual([]);
	});

	it('keeps what it is given, in order, and hands back a copy', () => {
		const memory = createMemory({ windowSize: 3, notebook: true });
		memory.notebook.append('first');
		memory.notebook.append('second');
		const stolen = memory.notebook.read();
		stolen.push('forged');
		expect(memory.notebook.read()).toEqual(['first', 'second']);
	});

	it('exists independently of the window filling up', () => {
		const memory = createMemory({ windowSize: 3, notebook: true });
		memory.notebook.append('written on tick 1');
		for (let tick = 1; tick <= 10; tick++) memory.remember(entry(tick));
		// The window has rolled over four times; the notebook has not.
		expect(memory.notebook.read()).toEqual(['written on tick 1']);
	});
});

describe('with no Memory brick at all', () => {
	it('is a first-class state rather than a special case', () => {
		const memory = createMemory();
		memory.remember(entry(1));
		memory.notebook.append('nowhere');

		expect(memory.enabled).toBe(false);
		expect(memory.notebookEnabled).toBe(false);
		expect(memory.window()).toEqual([]);
		expect(memory.size()).toBe(0);
		expect(memory.notebook.read()).toEqual([]);
	});
});

describe('rendering the window into a prompt', () => {
	it('names every part of a tick that actually happened, and no others', () => {
		const rendered = summariseWindow([
			{
				tick: 4,
				observation: 'at column 2, row 3 you could see the toy chest to the north',
				thought: 'I should open it.',
				action: 'tried to open',
				result: 'The toy chest is locked.'
			}
		]);

		expect(rendered).toContain('Tick 4');
		expect(rendered).toContain('you saw — at column 2, row 3');
		expect(rendered).toContain('you thought — I should open it.');
		expect(rendered).toContain('you did — tried to open');
		expect(rendered).toContain('what happened — The toy chest is locked.');
		expect(rendered).not.toContain('refused');
	});

	it('records a refusal as its own thing, because it is not a result', () => {
		// A blocked attempt never reached the world, and a bot that reads it as
		// "what happened" learns the wrong lesson about what the world allows.
		const rendered = summariseWindow([
			{
				tick: 2,
				observation: 'nothing much',
				thought: 'I will open it.',
				refused: 'a safety rule stopped you'
			}
		]);
		expect(rendered).toContain('refused — a safety rule stopped you');
		expect(rendered).not.toContain('what happened');
	});
});
