import {
	createPackRegistry,
	workflowRunSchema,
	type AgentSpec,
	type DeskWorldState,
	type PackManifest,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import fsBankPack, { population } from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { followHandoff, journeyLayout, runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { collectionsBook } from './book.js';
import { COLLECTIONS_CEILINGS } from './decision-rights.js';
import fsCollectionsPack from './index.js';
import { planFor } from './testing/plans.js';
import { collectionsCaseFromItem } from './world/cases.js';
import { WORK_ITEM_LAYOUT, collectionsDesk } from './world/desk.js';
import {
	COLLECTIONS_CONFIGURATION_IDS,
	COLLECTIONS_CONFIGURATIONS,
	SERVICING_WORKFLOW_ID,
	collectionsDecisionKind,
	collectionsWorkflow,
	type CollectionsConfigurationId
} from './workflow.js';

/**
 * **The arrears workflow** (WP105, `91-FS-COLLECTIONS.md` §5): the five
 * configurations over the same book, `rules-only` agreeing with the rule
 * on every row, the decision a person's below Level 5 and its touches
 * counted, the handoff to servicing on a disclosure (its target not yet
 * installed: the item carries the disclosure and the follow is refused),
 * the ceiling-breach at Level 5 and not at Level 3, the intake refusing a
 * malformed item, the journey drawn.
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
			blurb: 'Scripted, deterministic, never sends anything anywhere.',
			stats: { words: 2, reasoning: 2, speed: 3 },
			costHint: 'low',
			defaults: { temperature: 0, maxTokens: 256 }
		}
	]
};
const PACKS = [starterPack, fsBankPack, fsCollectionsPack, CARTRIDGES];

const SPEC: AgentSpec = {
	id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
	name: 'Deskbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: collectionsDesk.senses.map((sense) => sense.id) },
		actions: { enabled: collectionsDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-collections/missed-payment',
	createdAt: '2026-09-12T09:00:00Z',
	updatedAt: '2026-09-12T09:00:00Z',
	schemaVersion: 1
};

const pop = population(1, { size: 400 });
const book = collectionsBook(pop);
const items = book.items;

async function runItem(
	item: WorkItem,
	configuration?: CollectionsConfigurationId,
	ordinal = 0
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(collectionsWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: COLLECTIONS_CONFIGURATIONS[configuration] } : {}),
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const offeredPlan = (run: WorkflowRun): string | undefined =>
	(run.stages.find((stage) => stage.stageId === 'record')?.output.value as { plan?: string })?.plan;
const verdictOf = (item: WorkItem) => String(item.truth.facts?.['verdict']).replace('should-', '');
const disclosesOf = (item: WorkItem) =>
	String(item.truth.facts?.['discloses']).replace('discloses-', '');

describe('the work-item layout and the book', () => {
	it('puts the book’s customer on the desk with the truth recomputed', () => {
		const item = items[0]!;
		const built = collectionsCaseFromItem(createTestClock().random, item);
		expect(built.truth.facts?.['verdict']).toBe(item.truth.facts?.['verdict']);
		expect(built.truth.facts?.['discloses']).toBe(item.truth.facts?.['discloses']);
		expect(built.extra.bank.customer.cohort.protectedProxies).toEqual([]);
		const world = collectionsDesk.create(WORK_ITEM_LAYOUT, { config: { item } });
		expect((world.snapshot() as DeskWorldState).records.some((r) => r.id === 'arrears')).toBe(true);
		expect(
			(collectionsDesk.create(WORK_ITEM_LAYOUT).snapshot() as DeskWorldState).queue
		).toHaveLength(1);
	});

	it('every eighth customer is in arrears; the four circumstances cycle; half disclose', () => {
		expect(book.kind).toBe('arrears');
		expect(items).toHaveLength(50);
		expect(items.filter((item) => disclosesOf(item) !== 'none')).toHaveLength(25);
		expect(new Set(items.map(verdictOf))).toEqual(
			new Set(['payment-plan', 'breathing-space', 'reduced-payments'])
		);
		expect(JSON.stringify(collectionsBook(population(1, { size: 400 })))).toBe(
			JSON.stringify(book)
		);
	});
});

describe('the arrears workflow over the book', { timeout: 300_000 }, () => {
	const sample = items.slice(0, 12);

	it('rules-only agrees with the rule on every row; a person is touched at the decision; a disclosure hands off', async () => {
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			expect(run.runIds).toEqual([]);
			expect(offeredPlan(run), item.id).toBe(verdictOf(item));
			const touched = touchedCaseOf(run, collectionsDecisionKind);
			expect(touched.touches.map((touch) => touch.kind)).toEqual(['human:decision']);
			if (disclosesOf(item) !== 'none') {
				expect(run.outcome).toBe('handed-off');
				expect(run.handoff?.to).toBe(SERVICING_WORKFLOW_ID);
				expect(run.handoff?.item.kind).toBe('servicing-request');
				expect(run.handoff?.item.truth.facts?.['disclosure']).toBe(
					`disclosure-${disclosesOf(item)}`
				);
			} else {
				expect(run.outcome).toBe('completed');
			}
		}
	});

	it('the handoff’s target is not yet installed: the follow is refused, the run stays handed-off with its item', async () => {
		const registry = createPackRegistry();
		for (const pack of PACKS) registry.registerPack(pack);
		const disclosed = sample.find((item) => disclosesOf(item) !== 'none')!;
		const source = await runItem(disclosed, 'rules-only', 3);
		expect(source.outcome).toBe('handed-off');
		await expect(
			followHandoff(source, registry, {
				packs: PACKS,
				spec: SPEC,
				providerFor: () => createMockProvider({ script: [] }),
				now: createTestClock().now,
				newId: createTestClock().newId
			})
		).rejects.toThrow(/fs-servicing\/servicing/);
	});

	it('the five configurations run over the same items, each a valid run, agreeing on the plan', async () => {
		const plans = new Map<string, Set<string>>();
		for (const configuration of COLLECTIONS_CONFIGURATION_IDS) {
			for (const [index, item] of sample.slice(0, 6).entries()) {
				const run = await runItem(item, configuration, index);
				expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(run))).success).toBe(true);
				expect(
					['completed', 'handed-off'],
					`${configuration} ${item.id}: ${run.stages.at(-1)?.finding ?? ''}`
				).toContain(run.outcome);
				const set = plans.get(item.id) ?? new Set<string>();
				set.add(offeredPlan(run) ?? 'none');
				plans.set(item.id, set);
				// A person at the decision below Level 5.
				const touched = touchedCaseOf(run, collectionsDecisionKind);
				expect(touched.touches.some((touch) => touch.kind === 'human:decision')).toBe(
					configuration !== 'bot-everywhere'
				);
			}
		}
		for (const [id, set] of plans) expect([...set], id).toHaveLength(1);
	});

	it('the ceiling-breach rate is zero at Level 3 and non-zero at Level 4 (the bot offers forbearance) and 5', async () => {
		const forbearance = sample.filter((item) => verdictOf(item) !== 'payment-plan').slice(0, 3);
		const breaches = async (configuration: CollectionsConfigurationId, over: WorkItem[]) => {
			let count = 0;
			for (const [index, item] of over.entries()) {
				const run = await runItem(item, configuration, index);
				const touched = touchedCaseOf(run, collectionsDecisionKind);
				for (const decision of touched.decisions ?? []) {
					if (decision.level > (COLLECTIONS_CEILINGS[decision.kind] ?? 5)) count += 1;
				}
			}
			return count;
		};
		expect(await breaches('bot-recommends', sample.slice(0, 4))).toBe(0);
		expect(await breaches('bot-with-a-person-at-the-decision', forbearance)).toBeGreaterThan(0);
		expect(await breaches('bot-everywhere', sample.slice(0, 4))).toBeGreaterThan(0);
	});

	it('the intake refuses a malformed work item with a finding', async () => {
		const malformed: WorkItem = {
			...sample[0]!,
			payload: { arrears: { monthlyRepayment: 'lots' } }
		};
		const run = await runItem(malformed, 'rules-only');
		expect(run.outcome).toBe('stopped');
		expect(run.stages).toHaveLength(1);
		expect(run.stages[0]).toMatchObject({ stageId: 'intake', status: 'error' });
	});
});

describe('the reference configurations', () => {
	it('carry their autonomy level and the ceilings from the decision-rights table', () => {
		expect(COLLECTIONS_CONFIGURATIONS['rules-only'].autonomy).toBeUndefined();
		expect(COLLECTIONS_CONFIGURATIONS['bot-contacts-only'].autonomy?.level).toBe(2);
		expect(COLLECTIONS_CONFIGURATIONS['bot-recommends'].autonomy?.level).toBe(3);
		expect(COLLECTIONS_CONFIGURATIONS['bot-with-a-person-at-the-decision'].autonomy?.level).toBe(4);
		expect(COLLECTIONS_CONFIGURATIONS['bot-everywhere'].autonomy).toEqual({
			level: 5,
			ceilings: COLLECTIONS_CEILINGS
		});
		expect(COLLECTIONS_CEILINGS).toEqual({
			forbearance: 3,
			'default-notice': 2,
			'plan-agreement': 4
		});
		expect(fsCollectionsPack.workflows?.map((workflow) => workflow.id)).toEqual([
			'fs-collections/arrears'
		]);
	});

	it('draws a book at a seed and size', () => {
		const drawn = collectionsWorkflow.book!({ seed: 1, size: 80 });
		expect(drawn.kind).toBe('arrears');
		expect(drawn.items).toHaveLength(10);
	});

	it('the journey is drawn: the decision fans to the agreement and the end; the agreement’s exit depends on the case', () => {
		const layout = journeyLayout(collectionsWorkflow);
		expect(layout.nodes.map((node) => node.stageId).sort()).toEqual(
			[...collectionsWorkflow.stages.map((stage) => stage.id)].sort()
		);
		const from = (stageId: string) =>
			layout.edges.filter((edge) => edge.from === stageId).map((edge) => edge.to);
		expect(from('decision')).toEqual(expect.arrayContaining(['agree', { end: true }]));
		expect(layout.edges.find((edge) => edge.from === 'agree')?.kind).toBe('case');
		expect(layout.nodes.find((node) => node.stageId === 'agree')?.irreversible).toBe(true);
		expect(layout.nodes.find((node) => node.stageId === 'decision')?.lane).toBe('colleague');
	});
});
