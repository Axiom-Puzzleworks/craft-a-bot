import { corpusDigest, type Corpus } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { checkCorpus, corpusFindings } from './corpus.js';

/** `checkCorpus` (WP119, `105-CORPORA.md` §4): a green corpus, a red one per refusal, the finding. */
const labels = { colour: { options: ['red', 'green'], guide: 'The badge’s colour.' } };
const rows = [
	{ id: 'r1', state: 'a red badge', tags: ['plain'], labels: { colour: 'red' } },
	{
		id: 'r2',
		state: 'a badge, greenish',
		tags: ['trap'],
		labels: { colour: 'green' },
		contested: { reason: 'greenish', alternatives: { colour: 'red' } }
	}
];
const frozen = (over: Partial<Corpus> = {}): Corpus => {
	const base: Corpus = {
		id: 'test/corpus/badges',
		name: 'Badges',
		version: '1',
		stateKind: 'words',
		guide: 'Synthetic.',
		labels,
		rows,
		annotators: [
			{ id: 'author', blind: false, primary: true },
			{ id: 'second', blind: true, kappa: { colour: 0.9 } }
		],
		heldOut: false,
		seenBy: [],
		digest: '',
		...over
	};
	return { ...base, digest: over.digest ?? corpusDigest(base) };
};
const checks = (corpus: Corpus) => checkCorpus(corpus).map((issue) => issue.check);

describe('checkCorpus (WP119)', () => {
	it('passes a frozen, labelled, blind-agreed corpus, with no finding', () => {
		expect(checkCorpus(frozen())).toEqual([]);
		expect(corpusFindings(frozen())).toEqual([]);
	});

	it('refuses the schema, a repeated row, and an alternative outside its set', () => {
		expect(checks({ ...frozen(), labels: 'no' } as unknown as Corpus)).toEqual([
			'corpus.well-formed'
		]);
		expect(checks(frozen({ rows: [rows[0]!, rows[0]!] }))).toEqual(['corpus.well-formed']);
		expect(
			checks(
				frozen({
					rows: [{ ...rows[1]!, contested: { reason: 'x', alternatives: { colour: 'blue' } } }]
				})
			)
		).toEqual(['corpus.well-formed']);
	});

	it('refuses a digest the rows do not hash to, unless asked not to look', () => {
		const stale = frozen({ digest: corpusDigest({ labels, rows: rows.slice(0, 1) }) });
		expect(checks(stale)).toEqual(['corpus.digest']);
		expect(checkCorpus(stale, { digest: false })).toEqual([]);
	});

	it('refuses a row with the shape of a real identifier', () => {
		expect(
			checks(frozen({ rows: [{ ...rows[0]!, state: 'my card is 4111 1111 1111 1111' }] }))
		).toEqual(['corpus.synthetic']);
	});

	it('refuses a missing label, a value outside its set, and a label the corpus does not define', () => {
		expect(
			checks(
				frozen({
					rows: [
						{ ...rows[0]!, labels: {} },
						{ ...rows[1]!, labels: { colour: 'blue', size: 'big' } }
					]
				})
			)
		).toEqual(['corpus.labels', 'corpus.labels', 'corpus.labels']);
	});

	it('refuses a held-out corpus that names no question set', () => {
		expect(checks(frozen({ heldOut: true }))).toEqual(['corpus.held-out']);
		expect(checks(frozen({ heldOut: true, questions: { id: 'q', digest: 'd' } }))).toEqual([]);
	});

	it('refuses no primary, a κ on a sighted annotator, on an unknown label or out of range', () => {
		expect(checks(frozen({ annotators: [] }))).toEqual(['corpus.annotators']);
		expect(
			checks(
				frozen({
					annotators: [
						{ id: 'author', blind: false, primary: true, kappa: { colour: 0.5 } },
						{ id: 'second', blind: true, kappa: { size: 0.5, colour: 1.5 } }
					]
				})
			)
		).toEqual(['corpus.annotators', 'corpus.annotators', 'corpus.annotators']);
	});

	it('finds a corpus its author labelled alone', () => {
		const alone = frozen({ annotators: [{ id: 'author', blind: false, primary: true }] });
		expect(checkCorpus(alone)).toEqual([]);
		expect(corpusFindings(alone).map((finding) => finding.check)).toEqual([
			'corpus.single-annotator'
		]);
	});
});
