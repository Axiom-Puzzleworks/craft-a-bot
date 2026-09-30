import {
	canonicalJson,
	type AgentSpec,
	type EngineEvent,
	type Executor,
	type PackManifest,
	type WorkItem,
	type WorkflowConfig,
	type WorkflowRun
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import fsAdvicePack from '@craftabot/pack-fs-advice';
import fsBankPack, { population } from '@craftabot/pack-fs-bank';
import fsCollectionsPack from '@craftabot/pack-fs-collections';
import starterPack from '@craftabot/pack-starter';
import { checkReader } from '@craftabot/pack-testkit';
import { runWorkflow, withoutReaders } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { servicingBook } from './book.js';
import fsServicingPack from './index.js';
import {
	CATEGORY_QUESTION,
	SERVICING_READERS,
	SERVICING_RULE_READERS,
	SUPPORT_NEED_QUESTION
} from './readers.js';
import { planFor } from './testing/plans.js';
import { servicingCaseFromItem } from './world/cases.js';
import { servicingDesk } from './world/desk.js';
import { classificationOf, needIn } from './world/rules.js';
import { SERVICING_CONFIGURATIONS, servicingWorkflow } from './workflow.js';

/**
 * **The identity** (WP117, `104-READERS.md` §6): the servicing book under
 * each configuration that classifies and records by rule, run again with the
 * rule readers fitted in their place — with no gate, and with a gate at the
 * top of the scale — projects to the same run byte for byte, and every agent
 * run's trace is the same trace. The readers pass `checkReader`.
 */
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
const PACKS = [
	starterPack,
	fsBankPack,
	fsServicingPack,
	fsAdvicePack,
	fsCollectionsPack,
	CARTRIDGES
];
const SPEC: AgentSpec = {
	id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
	name: 'Deskbot',
	bricks: {
		llm: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' },
		sense: { channels: servicingDesk.senses.map((sense) => sense.id) },
		actions: { enabled: servicingDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-servicing/address-change',
	createdAt: '2026-09-30T09:00:00Z',
	updatedAt: '2026-09-30T09:00:00Z',
	schemaVersion: 1
};

const items = servicingBook(population(1, { size: 240 })).items;

async function runItem(item: WorkItem, config: WorkflowConfig, ordinal: number) {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	const traces: EngineEvent[][] = [];
	const run: WorkflowRun = await runWorkflow(servicingWorkflow, item, {
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

/** The configuration with the rule readers where it had the rules, and the stages that swapped. */
/**
 * An agent run's trace as the session wrote it: the workflow's own `stage.*`
 * events on it keep their place and payload, but not the id and time the
 * workflow's counter and clock stamped them with — which the reader's one
 * extra event shifts.
 */
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
	for (const [stageId, reader] of Object.entries(SERVICING_RULE_READERS)) {
		if (executors[stageId]?.kind !== 'rule') continue;
		executors[stageId] = gate && reader.kind === 'reader' ? { ...reader, gate } : reader;
		stages.push(stageId);
	}
	return { config: { ...config, executors }, stages };
}

describe('the servicing rule readers (WP117)', { timeout: 300_000 }, () => {
	it('change no outcome where they replace the rules, gated or not', async () => {
		let compared = 0;
		for (const id of ['rules-only', 'bot-identifies-only'] as const) {
			const base = SERVICING_CONFIGURATIONS[id];
			const plain = fitted(base);
			expect(plain.stages.sort(), id).toEqual(['classify', 'record']);
			const gated = fitted(base, { threshold: 1, else: { kind: 'rule', rule: 'classify-v1' } });
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
					const reached = byReader.run.stages.filter((stage) => stage.reader);
					for (const stage of reached)
						expect(stage.reader).toMatchObject({ confidence: 1, gated: false });
					expect(canonicalJson(byReader.run.stages)).not.toBe(canonicalJson(byRule.run.stages));
					compared += 1;
				}
			}
		}
		expect(compared).toBe(items.length * 4);
	});

	it('pass checkReader over the book’s own requests', async () => {
		const subjects = items.map(
			(item) =>
				servicingCaseFromItem(createTestClock().random, item).extra.servicing.request.subject
		);
		expect(new Set(subjects.map(classificationOf)).size).toBe(5);
		const [category, need] = SERVICING_READERS;
		expect(
			await checkReader(
				category!,
				subjects.map((subject) => ({
					subject,
					questions: { category: CATEGORY_QUESTION },
					expect: { category: classificationOf(subject) }
				}))
			)
		).toEqual([]);
		expect(
			await checkReader(
				need!,
				subjects.map((subject) => ({
					subject,
					questions: { need: SUPPORT_NEED_QUESTION },
					expect: { need: needIn(subject) }
				}))
			)
		).toEqual([]);
	});
});
