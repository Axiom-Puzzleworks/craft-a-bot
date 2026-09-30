import { describe, expect, it } from 'vitest';
import { contentRecordSchema, localPackFrom } from './content.js';
import {
	corpusDigest,
	corpusSchema,
	heldOutRefusal,
	parseCorpus,
	seenByFor,
	type Corpus
} from './corpus.js';
import { evidenceItemSchema } from './evidence.js';

/** The corpus as content (WP119, `105-CORPORA.md` §3, §5): the digest's scope, the held-out rule, the content and evidence kinds. */
const labels = { colour: { options: ['red', 'green'], guide: 'The badge’s colour.' } };
const rows = [
	{ id: 'r1', state: 'a red badge', tags: ['plain'], labels: { colour: 'red' } },
	{ id: 'r2', state: 'a green badge', tags: ['plain'], labels: { colour: 'green' } }
];
const corpus: Corpus = {
	id: 'test/corpus/badges',
	name: 'Badges',
	version: '1',
	stateKind: 'words',
	guide: 'Synthetic, written by the authors.',
	labels,
	rows,
	annotators: [{ id: 'author', blind: false, primary: true }],
	heldOut: false,
	seenBy: [{ readerId: 'test/reader/r', questions: 'test/questions/q1', on: '2026-09-28' }],
	digest: corpusDigest({ labels, rows })
};

describe('the corpus', () => {
	it('hashes its labels and rows, whatever the key order, and nothing else', () => {
		const reordered = {
			rows: rows.map((row) => ({
				labels: row.labels,
				tags: row.tags,
				state: row.state,
				id: row.id
			})),
			labels
		};
		expect(corpusDigest(reordered)).toBe(corpus.digest);
		expect(corpusDigest({ labels, rows: rows.slice(0, 1) })).not.toBe(corpus.digest);
		expect(parseCorpus({ ...corpus, seenBy: [], annotators: [] }).digest).toBe(corpus.digest);
	});

	it('refuses a reader with no question set, and a seen one unless it is a regression', () => {
		expect(heldOutRefusal(corpus, { readerId: 'test/reader/r' }, false)).toContain(
			'names no question set'
		);
		expect(
			heldOutRefusal(corpus, { readerId: 'test/reader/r', questionSet: 'test/questions/q1' }, false)
		).toContain('has already scored reader "test/reader/r"');
		expect(
			heldOutRefusal(corpus, { readerId: 'test/reader/r', questionSet: 'test/questions/q1' }, true)
		).toBeUndefined();
		expect(
			heldOutRefusal(corpus, { readerId: 'test/reader/r', questionSet: 'test/questions/q2' }, false)
		).toBeUndefined();
		expect(seenByFor(corpus, 'test/reader/other', 'test/questions/q1')).toBeUndefined();
	});

	it('is a content kind under local/corpora/, registered by the local pack, and an evidence kind', () => {
		const local = { ...corpus, id: 'local/corpora/badges' };
		const record = {
			id: local.id,
			kind: 'corpus' as const,
			title: 'Badges',
			record: local,
			savedAt: '2026-09-30T09:00:00.000Z',
			schemaVersion: 1 as const
		};
		expect(contentRecordSchema.safeParse(record).success).toBe(true);
		expect(
			contentRecordSchema.safeParse({ ...record, record: { ...local, labels: 'no' } }).success
		).toBe(false);
		expect(localPackFrom([contentRecordSchema.parse(record)]).corpora?.[0]?.id).toBe(local.id);
		expect(
			evidenceItemSchema.safeParse({
				kind: 'corpus',
				id: corpus.id,
				digest: corpus.digest,
				pushedAt: '2026-09-30T09:00:00.000Z',
				payload: corpus
			}).success
		).toBe(true);
		expect(corpusSchema.safeParse({ ...corpus, digest: 'x' }).success).toBe(false);
	});
});
