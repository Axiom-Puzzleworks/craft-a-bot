import {
	corpusDigest,
	type Book,
	type Corpus,
	type PackManifest,
	type Reader,
	type ReaderExecutor,
	type WorkflowSpec
} from '@craftabot/core';
import { TEST_DESK_ID, testDesk } from '@craftabot/desk/testing';
import { describe, expect, it } from 'vitest';
import { parseCampaign, prepareCampaign, runCampaign } from './campaign.js';

/**
 * **A book from a corpus, and the held-out rule** (WP119, `105-CORPORA.md`
 * §5, §7): the source names a corpus, the workflow's `book` makes one item
 * per row with the row's label as its truth and says which corpus it drew;
 * a reader the corpus has already scored with the same questions is refused
 * before any cell runs, and admitted when the source is a regression, every
 * cell then saying so; a reader that names no question set is refused; a book
 * that is not the corpus it claims is refused.
 */
const labels = { colour: { options: ['red', 'green'], guide: 'The badge’s colour.' } };
const rows = Array.from({ length: 6 }, (_, i) => ({
	id: `row-${i}`,
	state: `badge ${i}`,
	tags: ['plain'],
	labels: { colour: i % 2 === 0 ? 'red' : 'green' }
}));
const CORPUS: Corpus = {
	id: 'badges/corpus/badges',
	name: 'Badges',
	version: '1',
	stateKind: 'words',
	guide: 'Synthetic.',
	labels,
	rows,
	annotators: [{ id: 'author', blind: false, primary: true }],
	heldOut: false,
	seenBy: [{ readerId: 'badges/reader/badge', questions: 'badges/questions/q1', on: '2026-09-28' }],
	digest: corpusDigest({ labels, rows })
};

const reader: Reader = {
	id: 'badges/reader/badge',
	name: 'Badge',
	description: 'Always red.',
	kind: 'hosted',
	egress: [],
	browserCapable: true,
	answers: ['choice'],
	ask: async () => ({
		model: 'badge-1',
		method: 'hosted',
		answers: {
			colour: { type: 'choice', choice: 'red', probabilities: { red: 1, green: 0 }, confidence: 1 }
		}
	})
};
const read = (questionSet?: string): ReaderExecutor => ({
	kind: 'reader',
	readerId: reader.id,
	...(questionSet ? { questionSet } : {}),
	subject: (input) => input,
	questions: () => ({
		colour: { type: 'choice', instructions: 'Which?', criteria: { red: 'Red', green: 'Green' } }
	}),
	output: (answers) => ({
		colour: answers['colour']?.type === 'choice' ? answers['colour'].choice : 'grey'
	})
});

const bookFrom = (corpus: Corpus | undefined, claim = corpus): Book => ({
	schemaVersion: 1,
	kind: 'application',
	items: (corpus?.rows ?? []).map((row, i) => ({
		id: `item-${row.id}`,
		kind: 'application',
		customerId: `customer-${i}`,
		arrivedAt: '2026-01-05T09:00:00.000Z',
		payload: { state: row.state },
		truth: { records: [], facts: { colour: String(row.labels['colour']) } }
	})),
	source: {
		populationDigest: 'test',
		seed: 1,
		size: 6,
		...(claim ? { corpus: { id: claim.id, digest: claim.digest } } : {})
	}
});

const workflow = (book: WorkflowSpec['book']): WorkflowSpec => ({
	id: 'badges/badges',
	name: 'Badges',
	worldId: TEST_DESK_ID,
	purpose: 'Read a badge',
	intake: (item) => ({ layoutId: 'one-visitor', input: item.payload }),
	stages: [
		{
			id: 'badge',
			name: 'Badge',
			input: { type: 'object' },
			output: { type: 'object', required: ['colour'] },
			executor: { kind: 'rule', rule: 'grey-v1' },
			answerKey: (truth) => ({
				colour: String((truth as { facts: { colour: string } }).facts.colour)
			}),
			next: () => 'end'
		}
	],
	first: 'badge',
	obligations: [],
	rules: { 'grey-v1': () => ({ output: { colour: 'grey' } }) },
	configurations: {
		seen: { executors: { badge: read('badges/questions/q1') } },
		fresh: { executors: { badge: read('badges/questions/q2') } },
		unnamed: { executors: { badge: read() } },
		rules: {}
	},
	...(book ? { book } : {})
});

const pack = (
	book: WorkflowSpec['book'] = (request) => bookFrom(request.corpus)
): PackManifest => ({
	id: 'badges',
	name: 'Badges',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	worlds: [testDesk],
	readers: [reader],
	corpora: [CORPUS],
	workflows: [workflow(book)]
});

const campaign = (configuration: string, regression = false) =>
	parseCampaign({
		schemaVersion: 1,
		id: `badges-${configuration}`,
		title: 'Badges',
		scenarios: [],
		source: {
			kind: 'book',
			workflowId: 'badges/badges',
			population: { seed: 1, size: 6 },
			corpus: CORPUS.id,
			...(regression ? { regression: true } : {})
		},
		builds: [
			{ id: configuration, base: { kind: 'starter-default' }, overrides: { configuration } }
		],
		guards: [{ id: 'none', fit: [] }],
		brains: [{ id: 'scripted-optimal', tier: 'scripted-optimal' }],
		seeds: [1],
		gates: [{ id: 'runs', require: { kind: 'outcome-rate', outcome: 'SUCCESS', atLeast: 1 } }]
	});

const FIXED = { now: () => '2026-09-30T09:00:00.000Z', newId: () => 'report-1' };

describe('a book from a corpus (WP119)', () => {
	it('draws one item per row, the corpus named on the book, and scores the reader against the labels', async () => {
		const prepared = prepareCampaign(campaign('fresh'), { packs: [pack()] });
		expect(prepared.book?.items).toHaveLength(6);
		expect(prepared.book?.source.corpus).toEqual({ id: CORPUS.id, digest: CORPUS.digest });
		const report = await runCampaign(campaign('fresh'), { packs: [pack()], ...FIXED });
		expect(report.summary?.calibration[0]).toMatchObject({ n: 6, accuracy: { k: 3 } });
		expect(report.cells.every((cell) => cell.regression === undefined)).toBe(true);
	});

	it('refuses a re-score, and admits it as a regression every cell names', async () => {
		expect(() => prepareCampaign(campaign('seen'), { packs: [pack()] })).toThrow(
			/has already scored reader "badges\/reader\/badge" with questions "badges\/questions\/q1"/
		);
		const report = await runCampaign(campaign('seen', true), { packs: [pack()], ...FIXED });
		expect(report.cells).toHaveLength(6);
		expect(report.cells.every((cell) => cell.regression === true)).toBe(true);
	});

	it('refuses a reader that names no question set, and a campaign with no reader passes', () => {
		expect(() => prepareCampaign(campaign('unnamed'), { packs: [pack()] })).toThrow(
			/names no question set/
		);
		expect(prepareCampaign(campaign('rules'), { packs: [pack()] }).cells).toHaveLength(6);
	});

	it('refuses a corpus no pack ships, and a book that is not the corpus it claims', () => {
		const stale = { ...CORPUS, digest: 'f'.repeat(64) };
		expect(() =>
			prepareCampaign(campaign('rules'), { packs: [pack(() => bookFrom(CORPUS, stale))] })
		).toThrow(/drew a book that is not corpus/);
		const elsewhere = parseCampaign({
			...campaign('rules'),
			source: { ...campaign('rules').source, corpus: 'badges/corpus/none' }
		});
		expect(() => prepareCampaign(elsewhere, { packs: [pack()] })).toThrow(/which no pack ships/);
	});
});
