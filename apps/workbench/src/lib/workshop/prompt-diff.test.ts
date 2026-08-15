import { describe, expect, it } from 'vitest';
import type { EngineEvent } from '@craftabot/core';
import { diffLines, diffPrompts, previousPrompt, sectionName } from './prompt-diff.js';

/**
 * The diff behind `17-…` §3's "the memory-window lesson made visible".
 *
 * The property that matters is what it does with an *insertion*: when the
 * memory window slides, one line falls off the top and every line after it
 * shifts. A positional comparison calls that "everything changed" and teaches
 * nobody anything. The whole value is in reporting one removal and one
 * addition.
 */

let seq = 0;
const prompt = (contents: string[], tick = 1): EngineEvent =>
	({
		id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
		runId: 'r',
		agentId: 'a',
		tick,
		timestamp: '2026-08-15T09:00:00.000Z',
		type: 'prompt.composed',
		payload: {
			messages: contents.map((content) => ({ role: 'user', content })),
			estimatedTokens: 10
		}
	}) as EngineEvent;

describe('line diff', () => {
	it('says nothing changed when nothing did', () => {
		expect(diffLines('a\nb', 'a\nb').every((line) => line.kind === 'same')).toBe(true);
	});

	it('reports a slid window as one removal and one addition', () => {
		// The whole point. Positionally, every line here has moved.
		const before = 'turn 1\nturn 2\nturn 3';
		const after = 'turn 2\nturn 3\nturn 4';
		const diff = diffLines(before, after);

		expect(diff.filter((l) => l.kind === 'removed').map((l) => l.text)).toEqual(['turn 1']);
		expect(diff.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['turn 4']);
		expect(diff.filter((l) => l.kind === 'same')).toHaveLength(2);
	});

	it('handles a section appearing from nothing', () => {
		// The memory block on the turn it first exists.
		const diff = diffLines('', 'you remember: nothing yet');
		expect(diff).toEqual([{ kind: 'added', text: 'you remember: nothing yet' }]);
	});

	it('handles a section disappearing', () => {
		expect(diffLines('gone', '')).toEqual([{ kind: 'removed', text: 'gone' }]);
	});

	it('keeps both sides of a replaced line', () => {
		const diff = diffLines('the snack is north', 'the snack is south');
		expect(diff.map((l) => l.kind).sort()).toEqual(['added', 'removed']);
	});
});

describe('prompt diff', () => {
	it('marks only the sections that moved', () => {
		const before = [
			{ role: 'system', content: 'you are a robot' },
			{ role: 'user', content: 'turn 1\nturn 2' },
			{ role: 'user', content: 'you see a table' }
		];
		const after = [
			{ role: 'system', content: 'you are a robot' },
			{ role: 'user', content: 'turn 1\nturn 2\nturn 3' },
			{ role: 'user', content: 'you see a teddy' }
		];

		const diffs = diffPrompts(before, after);
		expect(diffs.map((d) => d.changed)).toEqual([false, true, true]);
		expect(diffs.map((d) => d.section)).toEqual(['system', 'memory', 'observation']);
	});

	it('names sections the way the other inspector does', () => {
		// Two panes calling the same block different things is its own small lie.
		expect(sectionName(0, 3)).toBe('system');
		expect(sectionName(1, 3)).toBe('memory');
		expect(sectionName(2, 3)).toBe('observation');
	});

	it('copes with a prompt that grew a section', () => {
		const diffs = diffPrompts(
			[{ role: 'system', content: 'sys' }],
			[
				{ role: 'system', content: 'sys' },
				{ role: 'user', content: 'new block' }
			]
		);
		expect(diffs).toHaveLength(2);
		expect(diffs[1]?.changed).toBe(true);
	});
});

describe('finding the previous prompt', () => {
	it('is nothing on the first prompt of a run', () => {
		const events = [prompt(['a'])];
		expect(previousPrompt(events, 0)).toBeUndefined();
	});

	it('skips back over everything that is not a prompt', () => {
		const events = [
			prompt(['first'], 1),
			{ ...prompt(['x'], 1), type: 'decision' } as EngineEvent,
			prompt(['second'], 2)
		];
		expect(previousPrompt(events, 2)?.id).toBe(events[0]?.id);
	});

	it('finds a re-prompt in the same turn', () => {
		/*
		 * Not "the prompt from the previous tick": a re-prompt after malformed
		 * output composes a second one in the same turn, and that pair is among
		 * the most interesting diffs available — it shows exactly what the engine
		 * added to get the bot back on track.
		 */
		const events = [prompt(['try'], 3), prompt(['try harder'], 3)];
		expect(previousPrompt(events, 1)?.id).toBe(events[0]?.id);
	});
});
