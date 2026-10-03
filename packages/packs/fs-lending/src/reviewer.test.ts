import type { AgentSpec, PackManifest, WorkItem, WorkflowRun } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import fsBankPack, { CASE_HANDLER_REVIEWER_ID, population } from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { lendingBook } from './book.js';
import fsLendingPack from './index.js';
import { planFor } from './testing/plans.js';
import { lendingDesk } from './world/desk.js';
import { LENDING_CONFIGURATIONS, lendingDecisionKind, lendingWorkflow } from './workflow.js';

/**
 * **The reviewer model on the lending journey** (WP115, `103-FALLIBLE-ACTORS.md`
 * §6): with `bot-recommends` the decision is a person's, and the person is a
 * model when the configuration names one. No reviewer, nothing new on the
 * record (the golden run's test holds that byte for byte); an oracle model —
 * accuracy 1, automation bias 0 — takes exactly the decisions the oracle
 * always took, now with `by` on the record; the bank's case handler answers
 * every human stage with its seconds, and human load folds its reviews.
 */
const ORACLE: PackManifest = {
	id: 'oracle-test',
	name: 'An oracle reviewer',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	calibrations: [
		{
			id: 'oracle-test/rows',
			title: 'Oracle',
			description: 'Always right, never led astray.',
			rows: ['acc', 'bias', 'secs'].map((id) => ({
				id,
				kind: id === 'secs' ? ('weights' as const) : ('rates' as const),
				title: id,
				distribution: id === 'acc' ? { correct: 1 } : id === 'bias' ? { follows: 0 } : { '90': 1 },
				source: { kind: 'assumption' as const, retrieved: '2026-09-29' },
				note: 'A test row.',
				tolerance: 0.01,
				review: 'pending' as const
			}))
		}
	],
	reviewerModels: [
		{
			id: 'oracle-test/oracle',
			name: 'Oracle',
			description: 'Always right.',
			accuracy: { table: 'oracle-test/rows', row: 'acc', key: 'correct' },
			automationBias: { table: 'oracle-test/rows', row: 'bias', key: 'follows' },
			secondsPerCase: { table: 'oracle-test/rows', row: 'secs', key: 'seconds' }
		}
	]
};
const CARTRIDGES: PackManifest = {
	id: 'test',
	name: 'Test cartridges',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	cartridges: [
		{
			id: 'test/mock-brain',
			providerId: 'mock',
			model: 'mock-1',
			displayName: 'Mock Brain',
			blurb: 'Scripted.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};
const PACKS = [starterPack, fsBankPack, fsLendingPack, CARTRIDGES, ORACLE];
const SPEC: AgentSpec = {
	id: '44444444-4444-4444-8444-444444444444',
	name: 'Deskbot',
	bricks: {
		llm: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' },
		sense: { channels: lendingDesk.senses.map((sense) => sense.id) },
		actions: { enabled: lendingDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-lending/clear-approve',
	createdAt: '2026-09-29T09:00:00Z',
	updatedAt: '2026-09-29T09:00:00Z',
	schemaVersion: 1
};
const items = lendingBook(population(1, { size: 400 })).book.items.slice(0, 24);

async function run(item: WorkItem, ordinal: number, reviewer?: string): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(lendingWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		config: {
			...LENDING_CONFIGURATIONS['bot-recommends'],
			...(reviewer ? { reviewer } : {})
		},
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const humanStages = (record: WorkflowRun) =>
	record.stages.filter((stage) => stage.executor.kind === 'human');

describe('the reviewer model on the lending journey (WP115)', { timeout: 300_000 }, () => {
	it('no reviewer: nothing new on the record; an oracle model: the same decisions, with who took them', async () => {
		for (const [index, item] of items.entries()) {
			const plain = await run(item, index);
			const oracle = await run(item, index, 'oracle-test/oracle');
			expect(humanStages(plain).every((stage) => stage.by === undefined)).toBe(true);
			expect(plain.config.reviewer).toBeUndefined();
			expect(oracle.config.reviewer).toBe('oracle-test/oracle');
			expect(oracle.stages.map((stage) => stage.output.value)).toEqual(
				plain.stages.map((stage) => stage.output.value)
			);
			for (const stage of humanStages(oracle))
				expect(stage.by).toMatchObject({ model: 'oracle-test/oracle', correct: true, seconds: 90 });
		}
	});

	it('writes reviewer.drew beside each human stage, and nothing without a model (WP160)', async () => {
		let drew = 0;
		for (const [index, item] of items.entries()) {
			const plain = await run(item, index);
			expect(plain.events.some((event) => event.type === 'reviewer.drew')).toBe(false);
			const oracle = await run(item, index, 'oracle-test/oracle');
			const events = oracle.events.filter((event) => event.type === 'reviewer.drew');
			expect(events).toHaveLength(humanStages(oracle).length);
			for (const event of events) {
				if (event.type !== 'reviewer.drew') continue;
				expect(event.payload).toMatchObject({
					model: 'oracle-test/oracle',
					rates: { accuracy: 1, automationBias: 0 },
					path: 'accurate'
				});
				expect(event.payload.rolls.length).toBeGreaterThanOrEqual(2);
				drew += 1;
			}
		}
		expect(drew).toBeGreaterThan(0);
	});

	it('the bank’s case handler answers every human stage, with its seconds, and human load folds the reviews', async () => {
		let reviewed = 0;
		for (const [index, item] of items.entries()) {
			const record = await run(item, index, CASE_HANDLER_REVIEWER_ID);
			const human = humanStages(record);
			expect(human.every((stage) => stage.by?.model === CASE_HANDLER_REVIEWER_ID)).toBe(true);
			for (const stage of human) {
				expect([60, 120, 240, 480]).toContain(stage.by?.seconds);
				expect(stage.approval?.decision).toBe(stage.by?.answer);
			}
			const touched = touchedCaseOf(record, lendingDecisionKind);
			expect(touched.reviews?.length ?? 0).toBe(human.length);
			reviewed += human.length;
		}
		expect(reviewed).toBeGreaterThan(0);
	});
});
