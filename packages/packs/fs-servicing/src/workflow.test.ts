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
import fsAdvicePack from '@craftabot/pack-fs-advice';
import { planFor as advicePlanFor } from '@craftabot/pack-fs-advice/testing';
import fsBankPack, { population } from '@craftabot/pack-fs-bank';
import fsCollectionsPack from '@craftabot/pack-fs-collections';
import { planFor as collectionsPlanFor } from '@craftabot/pack-fs-collections/testing';
import starterPack from '@craftabot/pack-starter';
import { followHandoff, journeyLayout, runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { servicingBook } from './book.js';
import { SERVICING_CEILINGS } from './decision-rights.js';
import fsServicingPack from './index.js';
import { planFor } from './testing/plans.js';
import { servicingCaseFromItem } from './world/cases.js';
import { WORK_ITEM_LAYOUT, servicingDesk } from './world/desk.js';
import {
	SERVICING_CONFIGURATION_IDS,
	SERVICING_CONFIGURATIONS,
	servicingDecisionKind,
	servicingWorkflow,
	type ServicingConfigurationId
} from './workflow.js';

/**
 * **The servicing workflow** (WP106, `92-FS-SERVICING.md` §5): the five
 * configurations over the same book, `rules-only` meeting every need, the
 * two handoffs — a bereavement's estate to advice, a disclosed need in
 * arrears to collections, the need on the item — each followed to a
 * completed run on the target desk, a collections handoff arriving as a
 * disclosure and not going back, the ceiling-breach at Level 5 and not at
 * Level 3, the intake refusing a malformed item, the journey drawn.
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
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: servicingDesk.senses.map((sense) => sense.id) },
		actions: { enabled: servicingDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-servicing/address-change',
	createdAt: '2026-09-12T09:00:00Z',
	updatedAt: '2026-09-12T09:00:00Z',
	schemaVersion: 1
};

const pop = population(1, { size: 240 });
const book = servicingBook(pop);
const items = book.items;

/** Every desk's plans, by card: a followed handoff lands on another desk's stage cards. */
const anyPlanFor = (goalCardId: string) => {
	for (const source of [planFor, advicePlanFor, collectionsPlanFor]) {
		try {
			return source(goalCardId);
		} catch {
			// not this desk's
		}
	}
	throw new Error(`no scripted solution for ${goalCardId}`);
};

async function runItem(
	item: WorkItem,
	configuration?: ServicingConfigurationId,
	ordinal = 0
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(servicingWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: SERVICING_CONFIGURATIONS[configuration] } : {}),
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(anyPlanFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const actOf = (run: WorkflowRun): string | undefined => {
	const close = run.stages.find((stage) => stage.stageId === 'close');
	const act = run.stages.find((stage) => stage.stageId === 'act');
	return ((close ?? act)?.output.value as { act?: string } | undefined)?.act;
};
const categoryOf = (item: WorkItem) =>
	String(item.truth.facts?.['category']).replace('category-', '');
const expectedAct = (item: WorkItem) => String(item.truth.facts?.['act']).replace('act-', '');

describe('the work-item layout and the book', () => {
	it('puts the book’s customer on the desk with the truth recomputed', () => {
		const item = items[0]!;
		const built = servicingCaseFromItem(createTestClock().random, item);
		expect(built.truth.facts?.['category']).toBe(item.truth.facts?.['category']);
		expect(built.truth.facts?.['act']).toBe(item.truth.facts?.['act']);
		expect(built.truth.facts?.['discloses']).toBe(item.truth.facts?.['discloses']);
		expect(built.extra.bank.customer.cohort.protectedProxies).toEqual([]);
		const world = servicingDesk.create(WORK_ITEM_LAYOUT, { config: { item } });
		expect((world.snapshot() as DeskWorldState).records.some((r) => r.id === 'request')).toBe(true);
		expect(
			(servicingDesk.create(WORK_ITEM_LAYOUT).snapshot() as DeskWorldState).queue
		).toHaveLength(1);
	});

	it('every sixth customer calls; the five requests cycle; two in five disclose', () => {
		expect(book.kind).toBe('servicing-request');
		expect(items).toHaveLength(40);
		expect(new Set(items.map(categoryOf))).toEqual(
			new Set(['address', 'card', 'third-party', 'disclosure', 'bereavement'])
		);
		expect(
			items.filter((item) => item.truth.facts?.['discloses'] !== 'discloses-none')
		).toHaveLength(16);
		expect(JSON.stringify(servicingBook(population(1, { size: 240 })))).toBe(JSON.stringify(book));
	});

	it('a collections handoff arrives as a disclosure with the need on it, and does not go back', () => {
		const item = items.find((entry) => categoryOf(entry) === 'address')!;
		const fromCollections: WorkItem = {
			...item,
			id: 'servicing-from-loan',
			kind: 'servicing-request',
			payload: {
				request: {
					category: 'disclosure',
					summary: 'Support need disclosed on the collections desk: job-loss. Lost their job.',
					disclosure: 'job-loss',
					plan: 'breathing-space'
				},
				customer: (item.payload as { customer: unknown }).customer
			},
			truth: {
				records: [],
				facts: { category: 'disclosure', disclosure: 'disclosure-job-loss', flagged: true }
			}
		};
		const built = servicingCaseFromItem(createTestClock().random, fromCollections);
		expect(built.extra.servicing.fromCollections).toBe(true);
		expect(built.extra.servicing.inArrears).toBe(true);
		expect(built.discloses).toBe('job-loss');
		expect(built.truth.facts?.['category']).toBe('category-disclosure');
	});
});

describe('the servicing workflow over the book', { timeout: 300_000 }, () => {
	const sample = items.slice(0, 15);

	it('rules-only meets every need; a bereavement hands off to advice, a disclosure in arrears to collections', async () => {
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			expect(run.runIds).toEqual([]);
			const expected = expectedAct(item);
			expect(actOf(run) ?? 'none', item.id).toBe(expected);
			const category = categoryOf(item);
			if (category === 'bereavement') {
				expect(run.outcome).toBe('handed-off');
				expect(run.handoff?.to).toBe('fs-advice/advice');
				expect(run.handoff?.item.kind).toBe('advice-request');
				expect(run.stages.some((stage) => stage.stageId === 'confirm')).toBe(true);
			} else if (category === 'disclosure') {
				expect(run.outcome).toBe('handed-off');
				expect(run.handoff?.to).toBe('fs-collections/arrears');
				expect(run.handoff?.item.kind).toBe('arrears');
				expect(run.handoff?.item.truth.facts?.['discloses']).toBe('discloses-job-loss');
				expect((run.handoff?.item.payload as { discloses?: string }).discloses).toBe('job-loss');
			} else {
				expect(run.outcome).toBe('completed');
			}
		}
	});

	it('the five configurations run over the same items, each a valid run, agreeing on the act', async () => {
		const acts = new Map<string, Set<string>>();
		for (const configuration of SERVICING_CONFIGURATION_IDS) {
			for (const [index, item] of sample.slice(0, 5).entries()) {
				const run = await runItem(item, configuration, index);
				expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(run))).success).toBe(true);
				expect(
					['completed', 'handed-off'],
					`${configuration} ${item.id}: ${run.stages.at(-1)?.finding ?? ''}`
				).toContain(run.outcome);
				const set = acts.get(item.id) ?? new Set<string>();
				set.add(actOf(run) ?? 'none');
				acts.set(item.id, set);
			}
		}
		for (const [id, set] of acts) expect([...set], id).toHaveLength(1);
	});

	it('both handoffs are followed to completed runs on their desks, the item’s truth carried', async () => {
		const registry = createPackRegistry();
		for (const pack of PACKS) registry.registerPack(pack);
		const specForTarget = (workflowId: string): AgentSpec => {
			const target = registry.getWorkflow(workflowId);
			const world = target ? registry.getWorld(target.worldId) : undefined;
			if (!world) throw new Error(`no world for ${workflowId}`);
			return {
				...SPEC,
				bricks: {
					...SPEC.bricks,
					sense: { channels: world.senses.map((sense) => sense.id) },
					actions: { enabled: world.actions.map((action) => action.id) }
				}
			};
		};
		const follow = async (item: WorkItem, ordinal: number) => {
			const source = await runItem(item, 'rules-only', ordinal);
			expect(source.outcome).toBe('handed-off');
			const clock = createTestClock({ idOffset: 7000 + ordinal });
			const seat = createTestClock({ idOffset: 7500 + ordinal });
			return followHandoff(source, registry, {
				packs: PACKS,
				spec: specForTarget(source.handoff!.to),
				providerFor: (_stage, goalCardId) =>
					createMockProvider({ script: obedient(anyPlanFor(goalCardId)) }),
				now: clock.now,
				newId: clock.newId,
				random: clock.random,
				session: { now: seat.now, newId: seat.newId, random: seat.random }
			});
		};
		const bereavement = sample.find((item) => categoryOf(item) === 'bereavement')!;
		const advice = await follow(bereavement, 1);
		expect(advice?.workflowId).toBe('fs-advice/advice');
		expect(['completed', 'handed-off']).toContain(advice?.outcome);
		const disclosure = sample.find((item) => categoryOf(item) === 'disclosure')!;
		const collections = await follow(disclosure, 2);
		expect(collections?.workflowId).toBe('fs-collections/arrears');
		// The need travelled: the collections desk gives breathing space and, its plan agreed, hands the disclosure back to servicing.
		expect(collections?.outcome).toBe('handed-off');
		expect(collections?.handoff?.to).toBe('fs-servicing/servicing');
		expect(
			(
				collections?.stages.find((stage) => stage.stageId === 'record')?.output.value as {
					plan?: string;
				}
			)?.plan
		).toBe('breathing-space');
	});

	it('the ceiling-breach rate is zero at Level 3 and non-zero at Level 5', async () => {
		const closures = sample.filter((item) => categoryOf(item) === 'bereavement').slice(0, 2);
		const breaches = async (configuration: ServicingConfigurationId, over: WorkItem[]) => {
			let count = 0;
			for (const [index, item] of over.entries()) {
				const run = await runItem(item, configuration, index);
				const touched = touchedCaseOf(run, servicingDecisionKind);
				for (const decision of touched.decisions ?? []) {
					if (decision.level > (SERVICING_CEILINGS[decision.kind] ?? 5)) count += 1;
				}
			}
			return count;
		};
		expect(await breaches('bot-recommends', sample.slice(0, 5))).toBe(0);
		expect(await breaches('bot-everywhere', closures)).toBeGreaterThan(0);
	});

	it('the intake refuses a malformed work item with a finding', async () => {
		const malformed: WorkItem = { ...sample[0]!, payload: { customer: {} } };
		const run = await runItem(malformed, 'rules-only');
		expect(run.outcome).toBe('stopped');
		expect(run.stages).toHaveLength(1);
		expect(run.stages[0]).toMatchObject({ stageId: 'request', status: 'error' });
	});
});

describe('the reference configurations', () => {
	it('carry their autonomy level and the ceilings from the decision-rights table', () => {
		expect(SERVICING_CONFIGURATIONS['rules-only'].autonomy).toBeUndefined();
		expect(SERVICING_CONFIGURATIONS['bot-identifies-only'].autonomy?.level).toBe(2);
		expect(SERVICING_CONFIGURATIONS['bot-recommends'].autonomy?.level).toBe(3);
		expect(SERVICING_CONFIGURATIONS['bot-with-a-person-at-the-closure'].autonomy?.level).toBe(4);
		expect(SERVICING_CONFIGURATIONS['bot-everywhere'].autonomy).toEqual({
			level: 5,
			ceilings: SERVICING_CEILINGS
		});
		expect(SERVICING_CEILINGS).toEqual({
			'disclosure-recording': 4,
			closure: 3,
			'third-party-access': 3
		});
		expect(fsServicingPack.workflows?.map((workflow) => workflow.id)).toEqual([
			'fs-servicing/servicing'
		]);
	});

	it('draws a book at a seed and size', () => {
		const drawn = servicingWorkflow.book!({ seed: 1, size: 60 });
		expect(drawn.kind).toBe('servicing-request');
		expect(drawn.items).toHaveLength(10);
	});

	it('the journey is drawn: the verification fans by the category, the confirm to the record and the end', () => {
		const layout = journeyLayout(servicingWorkflow);
		expect(layout.nodes.map((node) => node.stageId).sort()).toEqual(
			[...servicingWorkflow.stages.map((stage) => stage.id)].sort()
		);
		const from = (stageId: string) =>
			layout.edges.filter((edge) => edge.from === stageId).map((edge) => edge.to);
		expect(from('confirm')).toEqual(expect.arrayContaining(['record', { end: true }]));
		expect(layout.edges.find((edge) => edge.from === 'verify')?.kind).toBe('enumerated');
		expect(from('verify')).toEqual(expect.arrayContaining(['confirm', 'act', 'record']));
		expect(layout.nodes.find((node) => node.stageId === 'close')?.irreversible).toBe(true);
	});
});
