import {
	createPackRegistry,
	workflowRunSchema,
	type AgentSpec,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import { createTestClock } from '@craftabot/core/testing';
import fsBankPack from '@craftabot/pack-fs-bank';
import fsServicingPack, {
	classificationOf,
	needIn,
	servicingDesk
} from '@craftabot/pack-fs-servicing';
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
const PACKS = [starterPack, fsBankPack, fsServicingPack, typesafePack, dgxSparkPack];
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
		run.stages.find(
			(stage) => stage.stageId === 'classify-gate' || stage.stageId === 'classify-commit'
		)?.output.value as { category?: string } | undefined
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

describe.each(CORPORA)('the journey under the regex, corpus %s', (_version, corpus) => {
	it('runs every row to completion and classifies as the regex reads it', async () => {
		let ordinal = 0;
		for (const item of corpusBook({ seed: 1, size: 120 }, corpus).items) {
			const run = await runItem(item, 'regex', ordinal++);
			// A bereavement read — right or wrong — closes the account and hands the estate to advice.
			expect(FINISHED, `${item.id}: ${JSON.stringify(run.stages.at(-1))}`).toContain(
				workflowRunSchema.parse(run).outcome
			);
			const text = (item.payload as { request: { subject: string } }).request.subject;
			expect(recordedCategory(run)).toBe(classificationOf(text));
			expect(run.stages.some((stage) => stage.stageId.endsWith('-review'))).toBe(false);
			const record = run.stages.find((stage) => stage.stageId === 'record-gate');
			expect((record?.output.value as { need?: string }).need).toBe(needIn(text));
		}
	}, 60_000);
});

const recorded = jevLine.cassette?.entries.length ?? 0;

describe.skipIf(recorded === 0).each(CORPORA)(
	'the journey under Jev from the cassette, corpus %s',
	(_version, corpus) => {
		it('runs every row with no network under both question sets, and the gate sends only unsure or steered rows to a person', async () => {
			let ordinal = 0;
			for (const item of corpusBook({ seed: 1, size: 120 }, corpus).items) {
				const open = await runItem(item, 'jev', ordinal++);
				expect(FINISHED, `${item.id}`).toContain(open.outcome);
				const gated = await runItem(item, 'jev-gate-0.90', ordinal++);
				expect(FINISHED).toContain(gated.outcome);
				const gate = gated.stages.find((stage) => stage.stageId === 'classify-gate')!;
				const { route, confidence } = gate.output.value as { route: string; confidence: number };
				expect(route).toBe(confidence >= 0.9 ? 'auto' : 'person');

				// The v2 questions: the steer rides with the request, and a gate sends a steered call to a person.
				const q2 = await runItem(item, 'jev-q2-gate-0.80', ordinal++);
				expect(FINISHED, `${item.id} q2`).toContain(q2.outcome);
				const q2gate = q2.stages.find((stage) => stage.stageId === 'classify-gate')!;
				const read = q2gate.output.value as { route: string; confidence: number; steer?: number };
				expect(read.steer, `${item.id} has no steer`).toBeTypeOf('number');
				expect(read.route).toBe(
					read.confidence >= 0.8 && read.steer! < STEER_THRESHOLD ? 'auto' : 'person'
				);
			}
		}, 240_000);
	}
);

const sparkRecorded = sparkClassifierLine.cassette?.entries.length ?? 0;

describe.skipIf(sparkRecorded === 0).each(CORPORA)(
	'the journey under the DGX Spark from its cassette, corpus %s',
	(_version, corpus) => {
		it('runs every row with no network on the same questions, and gates it the same way', async () => {
			let ordinal = 0;
			for (const item of corpusBook({ seed: 1, size: 120 }, corpus).items) {
				const open = await runItem(item, 'spark', ordinal++);
				expect(FINISHED, `${item.id} spark`).toContain(open.outcome);
				const read = open.stages.find((stage) => stage.stageId === 'classify')!;
				expect((read.output.value as { model: string }).model).toBe('Qwen3.5-122B-A10B-NVFP4');

				const q2 = await runItem(item, 'spark-q2-gate-0.80', ordinal++);
				expect(FINISHED, `${item.id} spark q2`).toContain(q2.outcome);
				const gate = q2.stages.find((stage) => stage.stageId === 'classify-gate')!;
				const value = gate.output.value as { route: string; confidence: number; steer?: number };
				expect(value.steer).toBeTypeOf('number');
				expect(value.route).toBe(
					value.confidence >= 0.8 && value.steer! < STEER_THRESHOLD ? 'auto' : 'person'
				);
			}
		}, 240_000);
	}
);
