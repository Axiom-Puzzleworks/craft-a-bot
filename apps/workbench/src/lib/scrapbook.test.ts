import { describe, expect, it } from 'vitest';
import type { GroupRunRecord, RunRecord } from '@craftabot/core';
import {
	groupsForAgent,
	outcomeFace,
	outcomeWords,
	roundsWords,
	runsForAgent,
	stepsWords,
	whenWords
} from './scrapbook.js';

/**
 * **How an adventure reads on the shelf** (`16-…` §1.4).
 *
 * The Scrapbook is the only place a child meets a run they are not watching,
 * so the row's wording is the feature rather than decoration around it.
 */
describe('outcomes', () => {
	const outcomes = [
		'SUCCESS',
		'OUT_OF_STEPS',
		'STOPPED_BY_GUARDRAIL',
		'STOPPED_BY_USER',
		'ERROR',
		'IN_PROGRESS'
	] as const;

	/** Never colour or emoji alone (`04-…` §7) — the face always has words with it. */
	it('gives every outcome a face and words', () => {
		for (const outcome of outcomes) {
			expect(outcomeFace(outcome)).not.toBe('');
			expect(outcomeWords(outcome)).not.toBe('');
		}
	});

	it('celebrates a win', () => {
		expect(outcomeWords('SUCCESS')).toBe('Did it!');
	});

	/**
	 * A run whose tab was shut is not a failure and must not read as one: the
	 * child simply went away, and the point of slice e is that the story is
	 * still here.
	 */
	it('is kind about a run that never finished', () => {
		expect(outcomeWords('IN_PROGRESS')).toBe('Never finished');
	});

	it('names the Safety Brick when it was the Safety Brick', () => {
		expect(outcomeWords('STOPPED_BY_GUARDRAIL')).toContain('Safety Brick');
	});
});

describe('stepsWords', () => {
	/** The sort of thing a five-year-old reads aloud and a grown-up explains away. */
	it('does not say "1 steps"', () => {
		expect(stepsWords(1)).toBe('1 step');
	});

	it('counts the rest', () => {
		expect(stepsWords(0)).toBe('0 steps');
		expect(stepsWords(13)).toBe('13 steps');
	});
});

describe('whenWords', () => {
	const now = new Date('2026-08-14T12:00:00.000Z');

	it('names today and yesterday', () => {
		expect(whenWords('2026-08-14T09:00:00.000Z', now)).toBe('Today');
		expect(whenWords('2026-08-13T22:00:00.000Z', now)).toBe('Yesterday');
	});

	it('gives a date for anything older', () => {
		expect(whenWords('2026-08-01T09:00:00.000Z', now)).not.toBe('Today');
		expect(whenWords('2026-08-01T09:00:00.000Z', now)).not.toBe('');
	});

	/** A stored date that cannot be read should not put "Invalid Date" on a card. */
	it('says nothing rather than something wrong', () => {
		expect(whenWords('not a date', now)).toBe('');
	});
});

describe('runsForAgent', () => {
	const run = (id: string, agentId: string): RunRecord => ({ id, agentId }) as unknown as RunRecord;

	it('keeps only the bot asked about, in the order given', () => {
		const runs = [run('a', 'bot-1'), run('b', 'bot-2'), run('c', 'bot-1')];

		expect(runsForAgent(runs, 'bot-1').map((r) => r.id)).toEqual(['a', 'c']);
	});

	it('is empty for a bot with no adventures', () => {
		expect(runsForAgent([run('a', 'bot-1')], 'bot-2')).toEqual([]);
	});
});

describe('roundsWords', () => {
	it('does not say "1 rounds"', () => {
		expect(roundsWords(1)).toBe('1 round');
	});

	it('counts the rest', () => {
		expect(roundsWords(0)).toBe('0 rounds');
		expect(roundsWords(12)).toBe('12 rounds');
	});
});

describe('groupsForAgent (WP31, `24-…` §4.5)', () => {
	const group = (id: string, memberAgentIds: string[]): GroupRunRecord =>
		({ id, memberAgentIds }) as unknown as GroupRunRecord;

	it('keeps only the episodes either named bot took part in', () => {
		const groups = [group('g1', ['robo', 'bolt']), group('g2', ['other-1', 'other-2'])];

		expect(groupsForAgent(groups, 'robo').map((g) => g.id)).toEqual(['g1']);
	});

	it('finds an episode by either of its two members', () => {
		const groups = [group('g1', ['robo', 'bolt'])];

		expect(groupsForAgent(groups, 'bolt').map((g) => g.id)).toEqual(['g1']);
	});

	it('is empty for a bot with no shared adventures', () => {
		expect(groupsForAgent([group('g1', ['robo', 'bolt'])], 'someone-else')).toEqual([]);
	});
});
