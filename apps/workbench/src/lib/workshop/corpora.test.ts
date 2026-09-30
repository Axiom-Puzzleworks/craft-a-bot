import type { Corpus } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import {
	annotatorLines,
	corpusListRow,
	labelSummaries,
	singleAnnotator,
	tagCounts
} from './corpora.js';

/** The corpora page's folds (WP119): a list row, the label sets counted, the tags, the annotators in words. */
const corpus: Corpus = {
	id: 'test/corpus/badges',
	name: 'Badges',
	version: '1',
	stateKind: 'words',
	guide: 'Synthetic.',
	labels: { colour: { options: ['red', 'green'], guide: 'The colour.' } },
	rows: [
		{ id: 'r1', state: 'a', tags: ['plain', 'trap'], labels: { colour: 'red' } },
		{
			id: 'r2',
			state: 'b',
			tags: ['plain'],
			labels: { colour: 'red' },
			contested: { reason: 'dim', alternatives: { colour: 'green' } }
		}
	],
	questions: { id: 'test/questions/q2', digest: 'd' },
	annotators: [
		{ id: 'author', blind: false, primary: true },
		{ id: 'second', blind: true, kappa: { colour: 0.9166 } }
	],
	heldOut: true,
	seenBy: [{ readerId: 'test/reader/r', questions: 'test/questions/q2', on: '2026-09-28' }],
	digest: 'e'.repeat(64)
};

describe('the corpora page', () => {
	it('lists a corpus in one row, and finds one its author labelled alone', () => {
		expect(corpusListRow(corpus)).toEqual({
			id: 'test/corpus/badges',
			name: 'Badges',
			version: '1',
			rows: 2,
			labels: 'colour',
			heldOut: 'held out from test/questions/q2',
			annotators: 2,
			seenBy: 1,
			finding: '—'
		});
		const alone = { ...corpus, heldOut: false, annotators: corpus.annotators.slice(0, 1) };
		expect(singleAnnotator(alone)).toBe(true);
		expect(corpusListRow(alone)).toMatchObject({
			heldOut: 'no',
			finding: 'labelled by its author alone'
		});
	});

	it('counts each label’s values and contested rows, the tags, and says the annotators in words', () => {
		expect(labelSummaries(corpus)).toEqual([
			{
				name: 'colour',
				guide: 'The colour.',
				counts: [
					{ option: 'red', rows: 2 },
					{ option: 'green', rows: 0 }
				],
				contested: 1
			}
		]);
		expect(tagCounts(corpus)).toEqual([
			{ tag: 'plain', rows: 2 },
			{ tag: 'trap', rows: 1 }
		]);
		expect(annotatorLines(corpus)).toEqual([
			'author (the author)',
			'second (blind): colour κ 0.92'
		]);
		expect(annotatorLines({ ...corpus, annotators: [{ id: 'x', blind: false }] })).toEqual([
			'x (sighted)'
		]);
	});
});
