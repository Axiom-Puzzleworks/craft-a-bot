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
import fsFraudPack from '@craftabot/pack-fs-fraud';
import { planFor as fraudPlanFor } from '@craftabot/pack-fs-fraud/testing';
import starterPack from '@craftabot/pack-starter';
import { followHandoff, journeyLayout, runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { disputesBook } from './book.js';
import { DISPUTES_CEILINGS } from './decision-rights.js';
import fsDisputesPack from './index.js';
import { planFor } from './testing/plans.js';
import { disputesCaseFromItem } from './world/cases.js';
import { WORK_ITEM_LAYOUT, disputesDesk } from './world/desk.js';
import { DEFAULT_DISPUTES_POLICY, disputeVerdict, type DisputesPolicy } from './world/rules.js';
import {
	DISPUTES_CONFIGURATION_IDS,
	DISPUTES_CONFIGURATIONS,
	disputesDecisionKind,
	disputesWorkflow,
	type DisputesConfigurationId
} from './workflow.js';

/**
 * **The disputes workflow** (WP104, `90-FS-DISPUTES.md` §5): the five
 * configurations over the same book, `rules-only` agreeing with the rule
 * on every row, the two handoffs — a scam to the fraud journey and its
 * alert worked, a decline to the complaints journey — each followed to a
 * completed run with the item's truth carried, the ceiling-breach at Level
 * 5 and not at Level 3, the limit as a knob sweeping the book
 * monotonically, the intake refusing a malformed item, the journey drawn.
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
const PACKS = [starterPack, fsBankPack, fsDisputesPack, fsFraudPack, fsAdvicePack, CARTRIDGES];

const SPEC: AgentSpec = {
	id: '99999999-9999-4999-8999-999999999999',
	name: 'Deskbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: disputesDesk.senses.map((sense) => sense.id) },
		actions: { enabled: disputesDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-disputes/clear-unauthorised',
	createdAt: '2026-09-12T09:00:00Z',
	updatedAt: '2026-09-12T09:00:00Z',
	schemaVersion: 1
};

const pop = population(1, { size: 600 });
const book = disputesBook(pop);
const items = book.items;

/** Every desk's plans, by card: a followed handoff lands on another desk's stage cards. */
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

async function runItem(
	item: WorkItem,
	configuration?: DisputesConfigurationId,
	ordinal = 0
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(disputesWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: DISPUTES_CONFIGURATIONS[configuration] } : {}),
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(anyPlanFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const decidedOutcome = (run: WorkflowRun): string | undefined =>
	(run.stages.find((stage) => stage.stageId === 'record')?.output.value as { outcome?: string })
		?.outcome;
const claimOf = (item: WorkItem) =>
	(item.payload as { claim: Parameters<typeof disputeVerdict>[0] & { transactionId: string } })
		.claim;
const verdictOf = (item: WorkItem) => item.truth.facts?.['verdict'];

describe('the work-item layout and the book', () => {
	it('puts the book’s customer on the desk with the truth recomputed under the policy', () => {
		const item = items[0]!;
		const built = disputesCaseFromItem(createTestClock().random, item);
		expect(built.claim.amount).toBe(claimOf(item).amount);
		expect(built.truth.facts?.['verdict']).toBe(verdictOf(item));
		expect(built.truth.facts?.['classification']).toBe(item.truth.facts?.['classification']);
		expect(built.extra.bank.customer.cohort.protectedProxies).toEqual([]);
		const world = disputesDesk.create(WORK_ITEM_LAYOUT, { config: { item } });
		expect((world.snapshot() as DeskWorldState).records.some((r) => r.id === 'dispute')).toBe(true);
		expect((disputesDesk.create(WORK_ITEM_LAYOUT).snapshot() as DeskWorldState).queue).toHaveLength(
			1
		);
	});

	it('every tenth customer disputes; the three classifications cycle; a scam above the limit every fifteenth', () => {
		expect(book.kind).toBe('dispute');
		expect(items).toHaveLength(60);
		const by = (fact: string) =>
			items.filter((item) => item.truth.facts?.['classification'] === fact);
		expect(by('class-unauthorised')).toHaveLength(20);
		expect(by('class-authorised-scam')).toHaveLength(20);
		expect(by('class-merchant')).toHaveLength(20);
		expect(items.filter((item) => verdictOf(item) === 'should-refer').length).toBeGreaterThan(0);
		expect(JSON.stringify(disputesBook(population(1, { size: 600 })))).toBe(JSON.stringify(book));
	});

	it('the reimbursement limit as a knob sweeps the book monotonically', () => {
		const counts = (policy: DisputesPolicy) => {
			const drawn = disputesBook(pop, { policy });
			const tally = { reimburse: 0, refer: 0, decline: 0 };
			for (const item of drawn.items) {
				const verdict = String(verdictOf(item)).replace('should-', '') as keyof typeof tally;
				tally[verdict] += 1;
			}
			return tally;
		};
		const limits = [1_000, 5_000, 20_000, 85_000, 200_000];
		const swept = limits.map((reimbursementLimit) =>
			counts({ ...DEFAULT_DISPUTES_POLICY, reimbursementLimit })
		);
		for (let i = 1; i < swept.length; i += 1) {
			expect(swept[i]!.reimburse).toBeGreaterThanOrEqual(swept[i - 1]!.reimburse);
			expect(swept[i]!.refer).toBeLessThanOrEqual(swept[i - 1]!.refer);
			expect(swept[i]!.decline).toBe(swept[i - 1]!.decline);
		}
		expect(swept[0]!.refer).toBeGreaterThan(swept.at(-1)!.refer);
	});
});

describe('the disputes workflow over the book', { timeout: 300_000 }, () => {
	const sample = items.slice(0, 15);

	it('rules-only agrees with the rule on every row; a scam hands off to fraud, a decline to complaints', async () => {
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			expect(run.runIds).toEqual([]);
			const expected = String(verdictOf(item)).replace('should-', '');
			expect(decidedOutcome(run), item.id).toBe(expected);
			const touched = touchedCaseOf(run, disputesDecisionKind);
			const confirmed = run.stages.some((stage) => stage.stageId === 'confirm');
			expect(confirmed).toBe(expected === 'reimburse');
			expect(touched.touches.map((touch) => touch.kind)).toEqual(
				confirmed ? ['human:confirm'] : []
			);
			const scam = item.truth.facts?.['scamPattern'] === true;
			if (expected === 'reimburse' && scam) {
				expect(run.outcome).toBe('handed-off');
				expect(run.handoff?.to).toBe('fs-fraud/fraud');
				expect(run.handoff?.item.kind).toBe('alert');
			} else if (expected === 'decline') {
				expect(run.outcome).toBe('handed-off');
				expect(run.handoff?.to).toBe('fs-advice/complaints');
				expect(run.handoff?.item.truth.facts?.['upheld']).toBe(false);
			} else {
				expect(run.outcome).toBe('completed');
			}
		}
	});

	it('the five configurations run over the same items, each a valid run, agreeing on the outcome', async () => {
		const outcomes = new Map<string, Set<string>>();
		for (const configuration of DISPUTES_CONFIGURATION_IDS) {
			for (const [index, item] of sample.slice(0, 6).entries()) {
				const run = await runItem(item, configuration, index);
				expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(run))).success).toBe(true);
				expect(
					['completed', 'handed-off'],
					`${configuration} ${item.id}: ${run.stages.at(-1)?.finding ?? ''}`
				).toContain(run.outcome);
				const set = outcomes.get(item.id) ?? new Set<string>();
				set.add(decidedOutcome(run) ?? 'none');
				outcomes.set(item.id, set);
			}
		}
		for (const [id, set] of outcomes) expect([...set], id).toHaveLength(1);
	});

	it('the scam’s handoff is followed into the fraud journey and its alert is worked; the decline’s into complaints', async () => {
		const registry = createPackRegistry();
		for (const pack of PACKS) registry.registerPack(pack);
		const scam = sample.find(
			(item) => item.truth.facts?.['scamPattern'] === true && verdictOf(item) === 'should-reimburse'
		)!;
		const decline = sample.find((item) => verdictOf(item) === 'should-decline')!;
		// The host fits the bot to the desk the target journey runs on (the clock does this per desk; the
		// runtime carries one spec per run), so a followed handoff lands with the target desk's senses and actions.
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
			const followed = await followHandoff(source, registry, {
				packs: PACKS,
				spec: specForTarget(source.handoff!.to),
				providerFor: (_stage, goalCardId) =>
					createMockProvider({ script: obedient(anyPlanFor(goalCardId)) }),
				now: clock.now,
				newId: clock.newId,
				random: clock.random,
				session: { now: seat.now, newId: seat.newId, random: seat.random }
			});
			return { source, followed };
		};
		const fraud = await follow(scam, 1);
		expect(fraud.followed?.workflowId).toBe('fs-fraud/fraud');
		expect(fraud.followed?.outcome).toBe('completed');
		expect(fraud.followed?.handoffs).toEqual([
			{ runId: fraud.source.id, workflowId: 'fs-disputes/disputes', itemId: scam.id }
		]);
		expect(fraud.followed?.stages.length).toBeGreaterThan(1);
		const complaints = await follow(decline, 2);
		expect(complaints.followed?.workflowId).toBe('fs-advice/complaints');
		expect(complaints.followed?.outcome).toBe('completed');
		expect(complaints.followed?.itemId).toBe(`complaint-from-${claimOf(decline).transactionId}`);
	});

	it('the ceiling-breach rate is zero at Level 3 and non-zero at Level 5', async () => {
		const reimbursements = sample
			.filter((item) => verdictOf(item) === 'should-reimburse')
			.slice(0, 4);
		const breaches = async (configuration: DisputesConfigurationId) => {
			let count = 0;
			for (const [index, item] of reimbursements.entries()) {
				const run = await runItem(item, configuration, index);
				const touched = touchedCaseOf(run, disputesDecisionKind);
				for (const decision of touched.decisions ?? []) {
					if (decision.level > (DISPUTES_CEILINGS[decision.kind] ?? 5)) count += 1;
				}
			}
			return count;
		};
		expect(await breaches('bot-recommends')).toBe(0);
		expect(await breaches('bot-with-a-person-at-the-reimbursement')).toBe(0);
		expect(await breaches('bot-everywhere')).toBe(reimbursements.length);
	});

	it('the intake refuses a malformed work item with a finding', async () => {
		const malformed: WorkItem = { ...sample[0]!, payload: { claim: { amount: 'lots' } } };
		const run = await runItem(malformed, 'rules-only');
		expect(run.outcome).toBe('stopped');
		expect(run.stages).toHaveLength(1);
		expect(run.stages[0]).toMatchObject({ stageId: 'intake', status: 'error' });
	});
});

describe('the reference configurations', () => {
	it('carry their autonomy level and the ceilings from the decision-rights table', () => {
		expect(DISPUTES_CONFIGURATIONS['rules-only'].autonomy).toBeUndefined();
		expect(DISPUTES_CONFIGURATIONS['bot-verifies-only'].autonomy?.level).toBe(2);
		expect(DISPUTES_CONFIGURATIONS['bot-recommends'].autonomy?.level).toBe(3);
		expect(DISPUTES_CONFIGURATIONS['bot-with-a-person-at-the-reimbursement'].autonomy?.level).toBe(
			4
		);
		expect(DISPUTES_CONFIGURATIONS['bot-everywhere'].autonomy).toEqual({
			level: 5,
			ceilings: DISPUTES_CEILINGS
		});
		expect(DISPUTES_CEILINGS).toEqual({
			'reimbursement-within-limit': 4,
			'reimbursement-above-limit': 3,
			'dispute-decline': 3
		});
		expect(fsDisputesPack.workflows?.map((workflow) => workflow.id)).toEqual([
			'fs-disputes/disputes'
		]);
	});

	it('draws a book at a seed and size', () => {
		const drawn = disputesWorkflow.book!({ seed: 1, size: 100 });
		expect(drawn.kind).toBe('dispute');
		expect(drawn.items).toHaveLength(10);
	});

	it('the journey is drawn with its two handoffs as case edges and the confirm fanning to the payment and the end', () => {
		const layout = journeyLayout(disputesWorkflow);
		expect(layout.nodes.map((node) => node.stageId).sort()).toEqual(
			[...disputesWorkflow.stages.map((stage) => stage.id)].sort()
		);
		const from = (stageId: string) =>
			layout.edges.filter((edge) => edge.from === stageId).map((edge) => edge.to);
		expect(from('confirm')).toEqual(expect.arrayContaining(['reimburse', { end: true }]));
		// `record`'s and `reimburse`'s next read the desk: the enumeration draws the case edge, a lit run the exit it took.
		expect(layout.edges.find((edge) => edge.from === 'record')?.kind).toBe('case');
		expect(layout.edges.find((edge) => edge.from === 'reimburse')?.kind).toBe('case');
		expect(layout.nodes.find((node) => node.stageId === 'reimburse')?.irreversible).toBe(true);
	});
});
