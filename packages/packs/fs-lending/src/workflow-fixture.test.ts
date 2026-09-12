import type { AgentSpec, StoredWorkflowRun } from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import fsBankPack, { population } from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { runWorkflow } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { lendingBook } from './book.js';
import fsLendingPack, { LENDING_CONFIGURATIONS, lendingDesk, lendingWorkflow } from './index.js';
import { planFor } from './testing/plans.js';

/**
 * **The committed workflow run** (WP86, `77-PIPELINE-AND-BOUNDARY.md` §6):
 * one application through the lending journey under
 * `bot-with-a-person-at-the-decision`, with fixed clocks, held byte-equal as
 * a stored workflow run with its item — the Pipeline's e2e and visual
 * fixture, imported on `/workshop/workflows`. Regenerate with
 * `npx vitest run src/workflow-fixture.test.ts -u` when the journey changes,
 * and say so in `77-…`.
 */
const PACKS = [starterPack, fsBankPack, fsLendingPack];
const SPEC: AgentSpec = {
	id: '44444444-4444-4444-8444-444444444444',
	name: 'Lendbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: lendingDesk.senses.map((sense) => sense.id) },
		actions: { enabled: lendingDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-lending/clear-approve',
	createdAt: '2026-09-06T09:00:00Z',
	updatedAt: '2026-09-06T09:00:00Z',
	schemaVersion: 1
};

export async function lendingWorkflowFixture(): Promise<StoredWorkflowRun> {
	const item = lendingBook(population(1, { size: 400 })).book.items[0]!;
	const clock = createTestClock({ idOffset: 7000 });
	const seat = createTestClock({ idOffset: 7500 });
	const run = await runWorkflow(lendingWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		config: LENDING_CONFIGURATIONS['bot-with-a-person-at-the-decision'],
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
	return {
		run,
		item,
		source: { kind: 'harness', build: 'bot-with-a-person-at-the-decision' },
		createdAt: run.finishedAt,
		schemaVersion: 1
	};
}

describe('fixtures/lending-workflow-run.v1.json', () => {
	it('matches the committed fixture exactly', async () => {
		const stored = await lendingWorkflowFixture();
		expect(stored.run.outcome).toBe('completed');
		await expect(JSON.stringify(stored, null, '\t')).toMatchFileSnapshot(
			'./fixtures/lending-workflow-run.v1.json'
		);
	});
});
