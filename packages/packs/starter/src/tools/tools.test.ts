import type { ToolContext } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import {
	calculator,
	checkOffStep,
	dice,
	evaluate,
	lookUpManual,
	makePlan,
	notebookRead,
	notebookWrite,
	starterTools
} from './index.js';

function context(overrides: Partial<ToolContext> = {}): ToolContext {
	const lines: string[] = [];
	return {
		tick: 1,
		notebook: { read: () => [...lines], append: (line) => lines.push(line) },
		random: () => 0.5,
		...overrides
	};
}

describe('the starter tool set', () => {
	it('ships the five V1 tools plus the Planner brick’s own two (WP30 stage B) and the Librarian’s own per-book two (WP32 stage A), all namespaced with JSON schemas', () => {
		expect(starterTools.map((tool) => tool.id)).toEqual([
			'starter/calculator',
			'starter/dice',
			'starter/notebook_read',
			'starter/notebook_write',
			'starter/look_up_manual',
			'starter/make_plan',
			'starter/check_off_step',
			'starter/library_games',
			'starter/library_history'
		]);
		for (const tool of starterTools) {
			expect(tool.parameters, tool.id).toMatchObject({ type: 'object' });
			expect(tool.description.length, tool.id).toBeGreaterThan(0);
		}
	});

	it('marks only the notebook tools as needing the notebook', () => {
		const needing = starterTools.filter((tool) => tool.requiresNotebook).map((tool) => tool.id);
		expect(needing).toEqual(['starter/notebook_read', 'starter/notebook_write']);
	});
});

describe('calculator', () => {
	it('gets the Sums-for-Teddy answer right', async () => {
		const result = await calculator.execute({ expression: '17 * 23' }, context());
		expect(result.ok).toBe(true);
		expect(result.output).toContain('391');
	});

	it.each([
		['2 + 3', 5],
		['10 - 4', 6],
		['6 / 4', 1.5],
		['7 % 3', 1],
		['2 ^ 10', 1024],
		['2 + 3 * 4', 14],
		['(2 + 3) * 4', 20],
		['17 x 23', 391],
		['84 ÷ 4', 21],
		['1.5 * 2', 3],
		['-', undefined],
		['2 +', undefined],
		['(2 + 3', undefined],
		['2 + 3)', undefined],
		['1 / 0', undefined],
		['5 % 0', undefined],
		['hello', undefined],
		['1.2.3 + 1', undefined],
		['', undefined]
	])('evaluates %s', (expression, expected) => {
		expect(evaluate(expression)).toBe(expected);
	});

	it('explains itself rather than throwing on nonsense', async () => {
		const result = await calculator.execute({ expression: 'banana' }, context());
		expect(result.ok).toBe(false);
		expect(result.output).toContain('cannot make sense');
	});

	it('rejects a missing expression', async () => {
		expect((await calculator.execute({}, context())).ok).toBe(false);
	});

	it('never evaluates arbitrary code', async () => {
		const result = await calculator.execute(
			{ expression: 'globalThis.process.exit(1)' },
			context()
		);
		expect(result.ok).toBe(false);
	});
});

describe('dice', () => {
	it('draws only from the injected randomness, so runs replay identically', async () => {
		const result = await dice.execute({ sides: 6, rolls: 3 }, context({ random: () => 0.5 }));
		expect(result.ok).toBe(true);
		expect(result.data).toMatchObject({ results: [4, 4, 4] });
	});

	it('defaults to a single six-sided die', async () => {
		const result = await dice.execute({}, context({ random: () => 0 }));
		expect(result.data).toMatchObject({ sides: 6, rolls: 1, results: [1] });
	});

	it('never rolls above the number of sides', async () => {
		const result = await dice.execute({ sides: 20 }, context({ random: () => 0.999999 }));
		expect(result.data).toMatchObject({ results: [20] });
	});

	it('phrases one roll and several rolls differently', async () => {
		expect((await dice.execute({ rolls: 1 }, context())).output).toContain('a 6-sided die');
		expect((await dice.execute({ rolls: 2 }, context())).output).toContain('2 6-sided dice');
	});

	it('rejects impossible dice', async () => {
		expect((await dice.execute({ sides: 1 }, context())).ok).toBe(false);
		expect((await dice.execute({ rolls: 99 }, context())).ok).toBe(false);
	});
});

describe('the notebook tools', () => {
	it('writes a note and reads it back', async () => {
		const ctx = context();
		await notebookWrite.execute({ note: 'the red key opens the chest' }, ctx);
		const read = await notebookRead.execute({}, ctx);
		expect(read.output).toContain('the red key opens the chest');
	});

	it('says so when the notebook is blank', async () => {
		expect((await notebookRead.execute({}, context())).output).toContain('blank');
	});

	it('rejects an empty note', async () => {
		expect((await notebookWrite.execute({ note: '' }, context())).ok).toBe(false);
	});

	it('accumulates notes across turns', async () => {
		const ctx = context();
		await notebookWrite.execute({ note: 'one' }, ctx);
		await notebookWrite.execute({ note: 'two' }, ctx);
		const read = await notebookRead.execute({}, ctx);
		expect(read.data).toMatchObject({ lines: ['one', 'two'] });
	});
});

describe('look_up_manual', () => {
	it('reveals the fact the locked-chest card turns on', async () => {
		const result = await lookUpManual.execute({ query: 'how do I open the chest?' }, context());
		expect(result.ok).toBe(true);
		expect(result.output).toContain('red key');
	});

	it('is honest when the encyclopedia has nothing', async () => {
		const result = await lookUpManual.execute({ query: 'the offside rule' }, context());
		expect(result.ok).toBe(true);
		expect(result.output).toContain('nothing to say');
		expect(result.data).toMatchObject({ entries: [] });
	});

	it('rejects an empty query', async () => {
		expect((await lookUpManual.execute({}, context())).ok).toBe(false);
	});
});

describe('make_plan', () => {
	it("confirms a plan, generically — the real accounting is the Planner brick's own job", async () => {
		const result = await makePlan.execute({ steps: ['Find the key', 'Open the chest'] }, context());
		expect(result.ok).toBe(true);
		expect(result.data).toMatchObject({ steps: ['Find the key', 'Open the chest'] });
	});

	it('rejects a plan with no steps', async () => {
		expect((await makePlan.execute({ steps: [] }, context())).ok).toBe(false);
	});

	it('rejects a missing steps argument', async () => {
		expect((await makePlan.execute({}, context())).ok).toBe(false);
	});
});

describe('check_off_step', () => {
	it("confirms a step number, generically — whether it is really on the plan is the brick's own call", async () => {
		const result = await checkOffStep.execute({ index: 2 }, context());
		expect(result.ok).toBe(true);
		expect(result.data).toMatchObject({ index: 2 });
	});

	it('rejects a step number below 1', async () => {
		expect((await checkOffStep.execute({ index: 0 }, context())).ok).toBe(false);
	});

	it('rejects a missing index', async () => {
		expect((await checkOffStep.execute({}, context())).ok).toBe(false);
	});
});
