import {
	canonicalJson,
	type AgentSpec,
	type EngineEvent,
	type Executor,
	type WorkItem,
	type WorkflowConfig,
	type WorkflowRun
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import fsBankPack, { complaintBook, population } from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { checkReader } from '@craftabot/pack-testkit';
import { runWorkflow, withoutReaders } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import fsAdvicePack from '../index.js';
import { planFor } from '../testing/plans.js';
import { complaintCaseFromItem } from './cases.js';
import { complaintsDesk } from './desk.js';
import { COMPLAINTS_READERS, COMPLAINTS_RULE_READERS, ROOT_CAUSE_QUESTION } from './readers.js';
import { COMPLAINTS_CONFIGURATIONS, complaintsWorkflow, rootCauseOf } from './workflow.js';

/**
 * **The identity** (WP117, `104-READERS.md` §6): the complaint book under each
 * configuration that finds the root cause by rule, run again with the rule
 * reader in its place — with no gate, and gated at the top of the scale —
 * projects to the same run byte for byte, and every agent run's trace is the
 * same trace. The reader passes `checkReader` over the book's own categories.
 */
const PACKS = [starterPack, fsBankPack, fsAdvicePack];
const SPEC: AgentSpec = {
	id: '77777777-7777-4777-8777-777777777777',
	name: 'Complaintsbot',
	bricks: {
		llm: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' },
		sense: { channels: complaintsDesk.senses.map((sense) => sense.id) },
		actions: { enabled: complaintsDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-advice/complaint-charges-error',
	createdAt: '2026-09-30T09:00:00Z',
	updatedAt: '2026-09-30T09:00:00Z',
	schemaVersion: 1
};

const items = complaintBook(population(1, { size: 400 })).items;

async function runItem(item: WorkItem, config: WorkflowConfig, ordinal: number) {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	const traces: EngineEvent[][] = [];
	const run: WorkflowRun = await runWorkflow(complaintsWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		config,
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random },
		onAgentRun: (agentRun) => traces.push(agentRun.events)
	});
	return { run, traces };
}

/** An agent run's trace as the session wrote it — the workflow's own `stage.*` events without the stamps the reader's extra event shifts. */
const unstamped = (traces: EngineEvent[][]) =>
	traces.map((trace) =>
		trace.map((event) => {
			if (!event.type.startsWith('stage.')) return event;
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { id, timestamp, ...rest } = event;
			return rest;
		})
	);

function fitted(
	config: WorkflowConfig,
	gate?: Extract<Executor, { kind: 'reader' }>['gate']
): { config: WorkflowConfig; stages: string[] } {
	const executors = { ...(config.executors ?? {}) };
	const stages: string[] = [];
	for (const [stageId, reader] of Object.entries(COMPLAINTS_RULE_READERS)) {
		if (executors[stageId]?.kind !== 'rule') continue;
		executors[stageId] = gate && reader.kind === 'reader' ? { ...reader, gate } : reader;
		stages.push(stageId);
	}
	return { config: { ...config, executors }, stages };
}

describe('the complaints rule reader (WP117)', { timeout: 300_000 }, () => {
	it('changes no outcome where it replaces the rule, gated or not', async () => {
		let compared = 0;
		for (const id of ['rules-only', 'bot-acknowledges-only'] as const) {
			const base = COMPLAINTS_CONFIGURATIONS[id];
			const plain = fitted(base);
			expect(plain.stages, id).toEqual(['root-cause']);
			const gated = fitted(base, { threshold: 1, else: { kind: 'rule', rule: 'root-cause-v1' } });
			for (const [index, item] of items.entries()) {
				const byRule = await runItem(item, base, index);
				for (const variant of [plain, gated]) {
					const byReader = await runItem(item, variant.config, index);
					expect(canonicalJson(withoutReaders(byReader.run, variant.stages)), item.id).toBe(
						canonicalJson(withoutReaders(byRule.run, variant.stages))
					);
					expect(canonicalJson(unstamped(byReader.traces))).toBe(
						canonicalJson(unstamped(byRule.traces))
					);
					for (const stage of byReader.run.stages.filter((entry) => entry.reader))
						expect(stage.reader).toMatchObject({ confidence: 1, gated: false });
					expect(canonicalJson(byReader.run.stages)).not.toBe(canonicalJson(byRule.run.stages));
					compared += 1;
				}
			}
		}
		expect(compared).toBe(items.length * 4);
	});

	it('passes checkReader over the book’s own categories', async () => {
		const categories = items.map(
			(item) => complaintCaseFromItem(createTestClock().random, item).extra.complaints.category
		);
		expect(new Set(categories.map(rootCauseOf)).size).toBeGreaterThan(2);
		expect(
			await checkReader(
				COMPLAINTS_READERS[0]!,
				categories.map((subject) => ({
					subject,
					questions: { cause: ROOT_CAUSE_QUESTION },
					expect: { cause: rootCauseOf(subject) }
				}))
			)
		).toEqual([]);
	});
});
