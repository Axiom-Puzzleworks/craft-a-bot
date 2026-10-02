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
import { planFor as advicePlanFor } from '@craftabot/pack-fs-advice/testing';
import fsBankPack, { DESK_READER_LINE, population } from '@craftabot/pack-fs-bank';
import fsFraudPack from '@craftabot/pack-fs-fraud';
import { planFor as fraudPlanFor } from '@craftabot/pack-fs-fraud/testing';
import starterPack from '@craftabot/pack-starter';
import { checkReader } from '@craftabot/pack-testkit';
import { runWorkflow, withoutReaders } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { disputesBook } from './book.js';
import fsDisputesPack from './index.js';
import {
	CLASSIFICATION_QUESTION,
	DISPUTES_GATED_READERS,
	DISPUTES_READERS,
	DISPUTES_RULE_READERS
} from './readers.js';
import { planFor } from './testing/plans.js';
import { disputesCaseFromItem } from './world/cases.js';
import { disputesDesk } from './world/desk.js';
import { classificationOf } from './world/rules.js';
import { DISPUTES_CONFIGURATIONS, disputesWorkflow } from './workflow.js';

/**
 * **The identity** (WP117, `104-READERS.md` §6): the disputes book under each
 * configuration that classifies by rule, run again with the rule reader in
 * its place — with no gate, and gated at the top of the scale — projects to
 * the same run byte for byte, handoffs and all, and every agent run's trace is
 * the same trace. The reader passes `checkReader` over the book's own claims.
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
const PACKS = [starterPack, fsBankPack, fsDisputesPack, fsFraudPack, fsAdvicePack, CARTRIDGES];
const SPEC: AgentSpec = {
	id: '99999999-9999-4999-8999-999999999999',
	name: 'Deskbot',
	bricks: {
		llm: { cartridgeId: 'test/mock-brain', temperature: 0, maxTokens: 256, personality: '' },
		sense: { channels: disputesDesk.senses.map((sense) => sense.id) },
		actions: { enabled: disputesDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-disputes/clear-unauthorised',
	createdAt: '2026-09-30T09:00:00Z',
	updatedAt: '2026-09-30T09:00:00Z',
	schemaVersion: 1
};

const items = disputesBook(population(1, { size: 600 })).items;

const anyPlanFor = (goalCardId: string) => {
	for (const source of [planFor, fraudPlanFor, advicePlanFor]) {
		try {
			return source(goalCardId);
		} catch {
			// not this desk's
		}
	}
	throw new Error(`no scripted solution for ${goalCardId}`);
};

async function runItem(item: WorkItem, config: WorkflowConfig, ordinal: number) {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	const traces: EngineEvent[][] = [];
	const run: WorkflowRun = await runWorkflow(disputesWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		config,
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(anyPlanFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random },
		onAgentRun: (agentRun) => traces.push(agentRun.events)
	});
	return { run, traces };
}

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

/** The shipped configuration with the rules back where its gated readers stand (WP138): the identity's baseline. */
function ruled(config: WorkflowConfig): WorkflowConfig {
	const executors = { ...(config.executors ?? {}) };
	for (const stageId of Object.keys(DISPUTES_RULE_READERS))
		if (executors[stageId]?.kind === 'reader')
			executors[stageId] = { kind: 'rule', rule: `${stageId}-v1` };
	return { ...config, executors };
}

function fitted(
	config: WorkflowConfig,
	gate?: Extract<Executor, { kind: 'reader' }>['gate']
): { config: WorkflowConfig; stages: string[] } {
	const executors = { ...(config.executors ?? {}) };
	const stages: string[] = [];
	for (const [stageId, reader] of Object.entries(DISPUTES_RULE_READERS)) {
		if (executors[stageId]?.kind !== 'rule') continue;
		executors[stageId] = gate && reader.kind === 'reader' ? { ...reader, gate } : reader;
		stages.push(stageId);
	}
	return { config: { ...config, executors }, stages };
}

describe('the gated readers the shipped configurations fit (WP138)', () => {
	it('stand where the rules stood, behind the desk’s line, with the rule as the else', () => {
		for (const [id, config] of Object.entries(DISPUTES_CONFIGURATIONS))
			for (const [stageId, executor] of Object.entries(config.executors ?? {})) {
				if (executor.kind !== 'reader') continue;
				expect(executor, `${id} · ${stageId}`).toEqual(
					DISPUTES_GATED_READERS[stageId as keyof typeof DISPUTES_GATED_READERS]
				);
				expect(executor.gate, `${id} · ${stageId}`).toEqual({
					threshold: DESK_READER_LINE,
					else: { kind: 'rule', rule: `${stageId}-v1` }
				});
			}
		const fitted = Object.values(DISPUTES_CONFIGURATIONS).filter(
			(config) => config.executors?.['classify']?.kind === 'reader'
		);
		expect(fitted.length).toBeGreaterThan(0);
	});
});

describe('the disputes rule reader (WP117)', { timeout: 300_000 }, () => {
	it('changes no outcome where it replaces the rule, gated or not', async () => {
		let compared = 0;
		for (const id of ['rules-only', 'bot-verifies-only'] as const) {
			// WP138: the shipped configuration fits the gated readers; the baseline puts the rules back.
			const base = ruled(DISPUTES_CONFIGURATIONS[id]);
			const plain = fitted(base);
			expect(plain.stages, id).toEqual(['classify']);
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
					for (const stage of byReader.run.stages.filter((entry) => entry.reader))
						expect(stage.reader).toMatchObject({ confidence: 1, gated: false });
					expect(canonicalJson(byReader.run.stages)).not.toBe(canonicalJson(byRule.run.stages));
					compared += 1;
				}
			}
		}
		expect(compared).toBe(items.length * 4);
	});

	it('passes checkReader over the book’s own claims', async () => {
		const figures = items.map((item) => {
			const { channel, customerMadeIt, newPayee } = disputesCaseFromItem(
				createTestClock().random,
				item
			).claim;
			return { channel, customerMadeIt, newPayee };
		});
		expect(new Set(figures.map(classificationOf)).size).toBe(3);
		expect(
			await checkReader(
				DISPUTES_READERS[0]!,
				figures.map((subject) => ({
					subject,
					questions: { classification: CLASSIFICATION_QUESTION },
					expect: { classification: classificationOf(subject) }
				}))
			)
		).toEqual([]);
	});
});
