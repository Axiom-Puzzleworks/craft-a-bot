import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { corpusDigest, parseCorpus, type Corpus } from '@craftabot/core';
import { afterAll, describe, expect, it } from 'vitest';
import {
	agreementForFiles,
	agreementOf,
	freezeCorpus,
	labelCorpus,
	renderAgreement
} from './corpus.js';

/**
 * **`craftabot corpus`** (WP119, `105-CORPORA.md` §6): `freeze` writes the
 * digest; `label` walks the rows and never shows a label — two rows with the
 * same words and different labels print the same block; `agreement` records
 * the annotator with κ per label and refuses labels for another freeze.
 */
const roots: string[] = [];
afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

const labels = {
	colour: { options: ['red', 'green'], guide: 'The badge’s colour.' },
	size: { options: ['small', 'large'], guide: 'The badge’s size.' }
};
const rows = [
	{
		id: 'r1',
		state: 'a badge on the counter',
		tags: ['plain'],
		labels: { colour: 'red', size: 'small' }
	},
	// The same words as r1, labelled the other way: the walk must print them alike.
	{
		id: 'r2',
		state: 'a badge on the counter',
		tags: ['plain'],
		labels: { colour: 'green', size: 'large' },
		contested: { reason: 'the light was poor', alternatives: { colour: 'red' } }
	},
	{
		id: 'r3',
		state: 'a large green badge',
		tags: ['plain'],
		labels: { colour: 'green', size: 'large' }
	},
	{
		id: 'r4',
		state: 'a small red badge',
		tags: ['plain'],
		labels: { colour: 'red', size: 'small' }
	}
];
const corpus: Corpus = {
	id: 'test/corpus/badges',
	name: 'Badges',
	version: '1',
	stateKind: 'words',
	guide: 'Synthetic rows written by the authors.',
	labels,
	rows,
	annotators: [{ id: 'author', blind: false, primary: true }],
	heldOut: false,
	seenBy: [],
	digest: corpusDigest({ labels, rows })
};

describe('craftabot corpus (WP119)', () => {
	it('freezes a corpus at its digest, whatever the file said', async () => {
		const root = await mkdtemp(join(tmpdir(), 'craftabot-corpus-'));
		roots.push(root);
		const file = join(root, 'badges.corpus.json');
		await writeFile(file, JSON.stringify({ ...corpus, digest: '0'.repeat(64) }), 'utf8');
		const { digest } = await freezeCorpus(file);
		expect(digest).toBe(corpus.digest);
		expect(parseCorpus(JSON.parse(await readFile(file, 'utf8'))).digest).toBe(corpus.digest);
	});

	it('walks the rows showing the guide, the options and the words — never a label', async () => {
		const shown: string[] = [];
		const answers = [
			'1',
			'small',
			'?',
			'unsure of the size',
			'nonsense',
			'2',
			'2',
			'green',
			'2',
			'red',
			'1'
		];
		const written = await labelCorpus({
			corpus,
			as: 'second',
			ask: async () => answers.shift() ?? '',
			write: (text) => shown.push(text)
		});
		const text = shown.join('');
		expect(text).toContain('Synthetic rows written by the authors.');
		expect(text).toContain('1. red');
		expect(text).not.toContain('the light was poor');
		// The two rows that share their words print one and the same block, whatever their labels.
		const block = (id: string) =>
			shown.find((part) => part.startsWith(`\n— ${id} `))!.replace(id, '');
		expect(block('r1')).toBe(block('r2'));
		expect(written.labels).toEqual([
			{ id: 'r1', labels: { colour: 'red', size: 'small' } },
			{ id: 'r2', labels: { colour: 'green', size: 'large' }, note: 'unsure of the size' },
			{ id: 'r3', labels: { colour: 'green', size: 'large' } },
			{ id: 'r4', labels: { colour: 'red', size: 'small' } }
		]);
		expect(written).toMatchObject({
			annotator: 'second',
			blind: true,
			corpusDigest: corpus.digest
		});
	});

	it('records κ per label against the primary, and refuses labels for another freeze', async () => {
		const second = {
			corpusId: corpus.id,
			corpusDigest: corpus.digest,
			annotator: 'second',
			blind: true,
			labels: [
				{ id: 'r1', labels: { colour: 'red', size: 'small' } },
				{ id: 'r2', labels: { colour: 'red', size: 'large' } },
				{ id: 'r3', labels: { colour: 'green', size: 'large' } },
				{ id: 'r4', labels: { colour: 'red', size: 'small' } }
			]
		};
		const { report, corpus: recorded } = agreementOf(corpus, second);
		expect(report.kappa).toEqual({ colour: 0.5, size: 1 });
		expect(report.disagreements['colour']).toEqual([{ id: 'r2', primary: 'green', second: 'red' }]);
		expect(recorded.annotators.at(-1)).toEqual({
			id: 'second',
			blind: true,
			kappa: { colour: 0.5, size: 1 }
		});
		expect(recorded.digest).toBe(corpus.digest);
		// Recorded again, the annotator is replaced, not repeated.
		expect(agreementOf(recorded, second).corpus.annotators).toHaveLength(2);
		expect(renderAgreement(report)).toContain('colour: κ 0.50, 1 disagreement(s)');
		expect(() => agreementOf(corpus, { ...second, corpusDigest: 'f'.repeat(64) })).toThrow(
			/not test\/corpus\/badges/
		);

		const root = await mkdtemp(join(tmpdir(), 'craftabot-corpus-'));
		roots.push(root);
		const file = join(root, 'badges.corpus.json');
		const labelsFile = join(root, 'second.json');
		await writeFile(file, JSON.stringify(corpus), 'utf8');
		await writeFile(labelsFile, JSON.stringify(second), 'utf8');
		await agreementForFiles(file, labelsFile);
		expect(parseCorpus(JSON.parse(await readFile(file, 'utf8'))).annotators).toHaveLength(2);
	});
});
