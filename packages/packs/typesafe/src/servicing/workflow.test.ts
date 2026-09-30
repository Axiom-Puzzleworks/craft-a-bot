import {
	createPackRegistry,
	workflowRunSchema,
	type AgentSpec,
	type Corpus,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import { createTestClock } from '@craftabot/core/testing';
import fsBankPack from '@craftabot/pack-fs-bank';
import fsServicingPack, {
	REQUESTS_V1_CORPUS_ID,
	REQUESTS_V2_CORPUS_ID,
	REQUESTS_V3_CORPUS_ID,
	classificationOf,
	servicingCorpus,
	needIn,
	servicingDesk
} from '@craftabot/pack-fs-servicing';
import readersLlmPack from '@craftabot/pack-readers-llm';
import dgxSparkPack, { sparkClassifierLine } from '@craftabot/pack-dgx-spark';
import starterPack from '@craftabot/pack-starter';
import { runWorkflow } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import typesafePack from '../index.js';
import { jevLine } from '../jev/line.js';
import { corpusBook } from './book.js';
import { SERVICING_CORPUS, type CorpusRow } from './corpus.js';
import { SERVICING_CORPUS_V2 } from './corpus-v2.js';
import { SERVICING_CORPUS_V3 } from './corpus-v3.js';
import {
	SERVICING_JEV_CONFIGURATIONS,
	SERVICING_JEV_WORKFLOW_ID,
	STEER_THRESHOLD,
	servicingJevWorkflow
} from './workflow.js';

/**
 * **The pluggable reader** (`98-JEV.md` §8): the journey runs every corpus
 * row to completion offline under the regex. The regex is scored against the
 * label, not itself. Where the cassette holds Jev's answers, Jev's
 * configurations run from it without a network, and a gate hands its unsure
 * rows to a person and to nobody else.
 */
const PACKS = [
	starterPack,
	fsBankPack,
	fsServicingPack,
	typesafePack,
	dgxSparkPack,
	readersLlmPack
];
const SPEC: AgentSpec = {
	id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
	name: 'Deskbot',
	bricks: {
		llm: {
			cartridgeId: 'none',
			temperature: 0,
			maxTokens: 64,
			personality: 'Unused: no agent stage runs.'
		},
		sense: { channels: servicingDesk.senses.map((sense) => sense.id) },
		actions: { enabled: servicingDesk.actions.map((action) => action.id) },
		memory: { windowSize: 3, notebook: false }
	},
	goalCardId: 'fs-servicing/address-change',
	createdAt: '2026-09-28T09:00:00Z',
	updatedAt: '2026-09-28T09:00:00Z',
	schemaVersion: 1
};

const book = corpusBook({ seed: 1, size: 120 });
const workflow = servicingJevWorkflow(corpusBook);
/** The corpora as content (WP119): what the book draws from, by the version the tables name. */
const CONTENT: Record<string, Corpus> = {
	v1: servicingCorpus(REQUESTS_V1_CORPUS_ID),
	v2: servicingCorpus(REQUESTS_V2_CORPUS_ID),
	v3: servicingCorpus(REQUESTS_V3_CORPUS_ID)
};
const CORPORA: [string, readonly CorpusRow[]][] = [
	['v1', SERVICING_CORPUS],
	['v2', SERVICING_CORPUS_V2],
	['v3', SERVICING_CORPUS_V3]
];

async function runItem(
	item: WorkItem,
	configuration: string,
	ordinal: number
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	return runWorkflow(workflow, item, {
		packs: PACKS,
		spec: SPEC,
		config: SERVICING_JEV_CONFIGURATIONS[configuration]!,
		providerFor: () => {
			throw new Error('no agent stage should run in this journey');
		},
		now: clock.now,
		newId: clock.newId,
		random: clock.random
	});
}

const FINISHED = ['completed', 'handed-off'];

const recordedCategory = (run: WorkflowRun) =>
	(
		run.stages.find((stage) => stage.stageId === 'classify-commit')?.output.value as
			{ category?: string } | undefined
	)?.category;

describe('the corpus book', () => {
	it('holds one item per corpus row, the label as truth', () => {
		expect(book.items).toHaveLength(SERVICING_CORPUS.length);
		const trap = book.items.find((item) => item.id.startsWith('jev-c13-'))!;
		expect(trap.truth.facts?.['category']).toBe('category-card');
		// The regex reads "died" as a bereavement; the label says card.
		expect(classificationOf(SERVICING_CORPUS.find((row) => row.id === 'c13')!.text)).toBe(
			'bereavement'
		);
	});

	it('registers beside the bank without touching the servicing workflow', () => {
		const registry = createPackRegistry();
		for (const pack of PACKS) registry.registerPack(pack);
		expect(registry.getWorkflow?.(SERVICING_JEV_WORKFLOW_ID)?.id ?? SERVICING_JEV_WORKFLOW_ID).toBe(
			SERVICING_JEV_WORKFLOW_ID
		);
		expect(registry.getServiceLine('typesafe/jev')?.id).toBe('typesafe/jev');
	});
});

describe('the v2 and v3 corpora', () => {
	it('keep their ids unique and apart, with a reason on every row the labellers split on', () => {
		const ids = [...SERVICING_CORPUS, ...SERVICING_CORPUS_V2, ...SERVICING_CORPUS_V3].map(
			(row) => row.id
		);
		expect(new Set(ids).size).toBe(ids.length);
		for (const row of [...SERVICING_CORPUS_V2, ...SERVICING_CORPUS_V3]) {
			if (row.secondNeed !== undefined || row.secondCategory !== undefined)
				expect(row.contested, row.id).toBeTruthy();
			expect(row.text, row.id).not.toMatch(/\d/);
		}
	});
});

describe.each(CORPORA)('the journey under the regex, corpus %s', (_version) => {
	it('runs every row to completion and classifies as the regex reads it', async () => {
		let ordinal = 0;
		for (const item of corpusBook({ seed: 1, size: 120 }, CONTENT[_version]!).items) {
			const run = await runItem(item, 'regex', ordinal++);
			// A bereavement read — right or wrong — closes the account and hands the estate to advice.
			expect(FINISHED, `${item.id}: ${JSON.stringify(run.stages.at(-1))}`).toContain(
				workflowRunSchema.parse(run).outcome
			);
			const text = (item.payload as { request: { subject: string } }).request.subject;
			expect(recordedCategory(run)).toBe(classificationOf(text));
			// The regex is a rule reader: confidence 1, never gated, never a person (WP120).
			expect(run.stages.filter((stage) => stage.reader?.gated)).toEqual([]);
			const record = run.stages.find((stage) => stage.stageId === 'record-commit');
			expect((record?.output.value as { need?: string }).need).toBe(needIn(text));
		}
	}, 60_000);
});

const recorded = jevLine.cassette?.entries.length ?? 0;

describe.skipIf(recorded === 0).each(CORPORA)(
	'the journey under Jev from the cassette, corpus %s',
	(_version) => {
		it('runs every row with no network under both question sets, and the gate sends only unsure or steered rows to a person', async () => {
			let ordinal = 0;
			for (const item of corpusBook({ seed: 1, size: 120 }, CONTENT[_version]!).items) {
				const open = await runItem(item, 'jev', ordinal++);
				expect(FINISHED, `${item.id}`).toContain(open.outcome);
				const gated = await runItem(item, 'jev-gate-0.90', ordinal++);
				expect(FINISHED).toContain(gated.outcome);
				const read = gated.stages.find((stage) => stage.stageId === 'classify')!.reader!;
				expect(read).toMatchObject({ readerId: 'typesafe/reader/jev', method: 'hosted' });
				expect(read.gated).toBe(!(read.confidence !== null && read.confidence >= 0.9));

				// The v2 questions: the steer rides with the request, and a gate sends a steered call to a person.
				const q2 = await runItem(item, 'jev-q2-gate-0.80', ordinal++);
				expect(FINISHED, `${item.id} q2`).toContain(q2.outcome);
				const q2read = q2.stages.find((stage) => stage.stageId === 'classify')!.reader!;
				expect(q2read.steer, `${item.id} has no steer`).toBeTypeOf('number');
				expect(q2read.gated).toBe(
					!(
						q2read.confidence !== null &&
						q2read.confidence >= 0.8 &&
						q2read.steer! < STEER_THRESHOLD
					)
				);
			}
		}, 240_000);
	}
);

const sparkRecorded = sparkClassifierLine.cassette?.entries.length ?? 0;

describe.skipIf(sparkRecorded === 0).each(CORPORA)(
	'the journey under the DGX Spark from its cassette, corpus %s',
	(_version) => {
		it('runs every row with no network on the same questions, and gates it the same way', async () => {
			let ordinal = 0;
			for (const item of corpusBook({ seed: 1, size: 120 }, CONTENT[_version]!).items) {
				const open = await runItem(item, 'spark', ordinal++);
				expect(FINISHED, `${item.id} spark`).toContain(open.outcome);
				const read = open.stages.find((stage) => stage.stageId === 'classify')!;
				expect(read.reader?.model).toBe('Qwen3.5-122B-A10B-NVFP4');

				const q2 = await runItem(item, 'spark-q2-gate-0.80', ordinal++);
				expect(FINISHED, `${item.id} spark q2`).toContain(q2.outcome);
				const value = q2.stages.find((stage) => stage.stageId === 'classify')!.reader!;
				expect(value.steer).toBeTypeOf('number');
				expect(value.gated).toBe(
					!(value.confidence !== null && value.confidence >= 0.8 && value.steer! < STEER_THRESHOLD)
				);
			}
		}, 240_000);
	}
);

const spark35Recorded =
	sparkClassifierLine.cassette?.entries.filter(
		(entry) => (entry.args as { model?: string }).model === 'Qwen3.6-35B-A3B-NVFP4'
	).length ?? 0;

describe.skipIf(spark35Recorded === 0).each(CORPORA)(
	'the journey under the Spark’s 35B chat model from its cassette, corpus %s',
	(_version) => {
		it('runs every row with no network on the same questions, and gates it the same way', async () => {
			let ordinal = 0;
			for (const item of corpusBook({ seed: 1, size: 120 }, CONTENT[_version]!).items) {
				const open = await runItem(item, 'spark35', ordinal++);
				expect(FINISHED, `${item.id} spark35`).toContain(open.outcome);
				const read = open.stages.find((stage) => stage.stageId === 'classify')!;
				expect(read.reader?.model).toBe('Qwen3.6-35B-A3B-NVFP4');

				const q2 = await runItem(item, 'spark35-q2-gate-0.80', ordinal++);
				expect(FINISHED, `${item.id} spark35 q2`).toContain(q2.outcome);
				const value = q2.stages.find((stage) => stage.stageId === 'classify')!.reader!;
				expect(value.steer).toBeTypeOf('number');
				expect(value.gated).toBe(
					!(value.confidence !== null && value.confidence >= 0.8 && value.steer! < STEER_THRESHOLD)
				);
			}
		}, 240_000);
	}
);

describe('one executor, four readers (WP120)', () => {
	it('reads with the regex, Jev, the LLM contract’s stand-in and Jev gated, each through the reader executor', async () => {
		const item = book.items[0]!;
		const configurations = ['regex', 'jev', 'llm-mock', 'jev-gate-0.80'];
		const readers: string[] = [];
		for (const [ordinal, configuration] of configurations.entries()) {
			const run = await runItem(item, configuration, ordinal);
			expect(FINISHED, configuration).toContain(run.outcome);
			for (const stageId of ['classify', 'record']) {
				const stage = run.stages.find((entry) => entry.stageId === stageId)!;
				expect(stage.executor.kind, `${configuration} ${stageId}`).toBe('reader');
				readers.push(`${configuration}:${stage.reader!.readerId}:${stage.reader!.method}`);
			}
		}
		expect(readers).toEqual([
			'regex:fs-servicing/reader/category:rule',
			'regex:fs-servicing/reader/support-need:rule',
			'jev:typesafe/reader/jev:hosted',
			'jev:typesafe/reader/jev:hosted',
			'llm-mock:readers-llm/reader/mock:logprobs',
			'llm-mock:readers-llm/reader/mock:logprobs',
			'jev-gate-0.80:typesafe/reader/jev:hosted',
			'jev-gate-0.80:typesafe/reader/jev:hosted'
		]);
	});

	it('the stand-in’s gate sends to a person exactly the rows it read under the threshold', async () => {
		let ordinal = 0;
		for (const item of book.items.slice(0, 30)) {
			const run = await runItem(item, 'llm-mock-gate-0.80', ordinal++);
			for (const stage of run.stages.filter((entry) => entry.reader)) {
				const { confidence, gated } = stage.reader!;
				expect(gated).toBe(confidence === null || confidence < 0.8);
				expect(stage.approval !== undefined).toBe(gated);
			}
		}
	});
});
