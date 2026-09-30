import { corpusDigest, type Corpus, type TypedQuestion } from '@craftabot/core';
import { ruleReader } from '@craftabot/governance';
import { describe, expect, it } from 'vitest';
import { scoreReader } from './corpus-score.js';

/** `scoreReader` (WP121, `105-CORPORA.md` §9.3): accuracy against the primary label and either labeller, the confusion, the misses. */
const labels = {
	colour: { options: ['red', 'green'], guide: 'The colour.' },
	urgent: { options: ['yes', 'no'], guide: 'Urgent?' }
};
const rows = [
	{ id: 'r1', state: 'a red badge', tags: [], labels: { colour: 'red', urgent: 'yes' } },
	{ id: 'r2', state: 'a green badge', tags: [], labels: { colour: 'green', urgent: 'no' } },
	{
		id: 'r3',
		state: 'a reddish badge',
		tags: [],
		labels: { colour: 'green', urgent: 'no' },
		contested: { reason: 'reddish', alternatives: { colour: 'red' } }
	},
	{ id: 'r4', state: 'a pale badge', tags: [], labels: { colour: 'red', urgent: 'no' } }
];
const corpus: Corpus = {
	id: 'test/corpus/badges',
	name: 'Badges',
	version: '1',
	stateKind: 'words',
	guide: 'Synthetic.',
	labels,
	rows,
	annotators: [{ id: 'author', blind: false, primary: true }],
	heldOut: false,
	seenBy: [],
	digest: corpusDigest({ labels, rows })
};
const colour: TypedQuestion = {
	type: 'choice',
	instructions: '?',
	criteria: { red: 'R', green: 'G' }
};
const reader = ruleReader({
	id: 'test/reader/red',
	name: 'Red',
	description: '.',
	answers: ['choice', 'noul'],
	rules: {
		colour: (subject) => (String(subject).includes('red') ? 'red' : 'green'),
		urgent: (subject) => String(subject).includes('red')
	}
});

describe('scoreReader (WP121)', () => {
	it('scores against the primary label and either labeller, with the confusion and the misses', async () => {
		const score = await scoreReader(reader, corpus, { label: 'colour', question: colour });
		expect(score).toMatchObject({ n: 4, right: 2, corpusDigest: corpus.digest });
		expect(score.accuracy.value).toBe(0.5);
		expect(score.eitherLabeller.value).toBe(0.75);
		expect(score.confusion).toEqual({ red: { red: 1, green: 1 }, green: { red: 1, green: 1 } });
		expect(score.wrong).toEqual([
			{ id: 'r3', label: 'green', answer: 'red' },
			{ id: 'r4', label: 'red', answer: 'green' }
		]);
	});

	it('reads a noul as yes at one half, under a question id of its own, and refuses an unknown label', async () => {
		const score = await scoreReader(reader, corpus, {
			label: 'urgent',
			questionId: 'urgent',
			question: { type: 'noul', instructions: 'Urgent?' }
		});
		expect(score.right).toBe(3);
		await expect(scoreReader(reader, corpus, { label: 'size', question: colour })).rejects.toThrow(
			/no label "size"/
		);
	});
});
