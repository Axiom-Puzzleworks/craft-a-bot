import { describe, expect, it } from 'vitest';
import { createMemory, summariseWindow, type TickMemory } from './memory.js';

function entry(tick: number, overrides: Partial<TickMemory> = {}): TickMemory {
	return { tick, observation: `saw thing ${tick}`, thought: `thought ${tick}`, ...overrides };
}

describe('a fitted Memory brick', () => {
	it('keeps entries oldest-first up to the window size, then rolls', () => {
		const memory = createMemory({ windowSize: 3, notebook: false });
		for (let tick = 1; tick <= 5; tick++) memory.remember(entry(tick));

		expect(memory.window().map((e) => e.tick)).toEqual([3, 4, 5]);
		expect(memory.size()).toBe(3);
	});

	it('reports itself enabled', () => {
		expect(createMemory({ windowSize: 10, notebook: false }).enabled).toBe(true);
	});

	it('hands back a copy, so callers cannot corrupt the window', () => {
		const memory = createMemory({ windowSize: 3, notebook: false });
		memory.remember(entry(1));
		memory.window().push(entry(99));
		expect(memory.size()).toBe(1);
	});
});

describe('no Memory brick', () => {
	it('remembers nothing and stays empty — the designed teaching failure', () => {
		const memory = createMemory();
		memory.remember(entry(1));
		expect(memory.enabled).toBe(false);
		expect(memory.window()).toEqual([]);
		expect(memory.size()).toBe(0);
	});

	it('has no notebook either', () => {
		const memory = createMemory();
		memory.notebook.append('a note');
		expect(memory.notebook.read()).toEqual([]);
	});
});

describe('the notebook', () => {
	it('stores lines when switched on', () => {
		const memory = createMemory({ windowSize: 3, notebook: true });
		memory.notebook.append('the red key opens the chest');
		expect(memory.notebookEnabled).toBe(true);
		expect(memory.notebook.read()).toEqual(['the red key opens the chest']);
	});

	it('silently ignores writes when switched off', () => {
		const memory = createMemory({ windowSize: 3, notebook: false });
		memory.notebook.append('a note');
		expect(memory.notebook.read()).toEqual([]);
	});
});

describe('summariseWindow', () => {
	it('renders one line per tick with only the parts that happened', () => {
		const summary = summariseWindow([
			entry(1),
			entry(2, { action: 'moved east', result: 'you roll one square east' })
		]);
		expect(summary).toBe(
			'Tick 1: you saw — saw thing 1; you thought — thought 1\n' +
				'Tick 2: you saw — saw thing 2; you thought — thought 2; you did — moved east; what happened — you roll one square east'
		);
	});

	it('omits an empty thought', () => {
		expect(summariseWindow([entry(1, { thought: '' })])).toBe('Tick 1: you saw — saw thing 1');
	});

	it('renders an empty window as an empty string', () => {
		expect(summariseWindow([])).toBe('');
	});
});
