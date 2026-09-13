import { readFileSync } from 'node:fs';
import {
	createPackRegistry,
	workflowRunSchema,
	type AgentSpec,
	type StoredWorkflowRun,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import fsBankPack, { complaintBook, population } from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { followHandoff, runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import fsAdvicePack, {
	COMPLAINTS_CONFIGURATIONS,
	COMPLAINTS_WORK_ITEM_LAYOUT,
	complaintCaseFromItem,
	complaintsDecisionKind,
	complaintsDesk,
	complaintsWorkflow,
	upheldByTheRegister,
	type ComplaintsConfigurationId
} from '../index.js';
import { planFor } from '../testing/plans.js';

/**
 * **The complaints journey** (WP102, `94-…` §3): the register's own rule
 * (a charges or a data complaint upheld, the rest declined) agreed with by
 * `rules-only` over the register; the five configurations each a valid run
 * that closes; the ceilings on the redress; the work-item layout; and the
 * committed golden run — one complaint through `bot-with-a-person-at-approval`
 * with fixed clocks, held byte-equal for the Pipeline and the Canvas.
 */
const PACKS = [starterPack, fsBankPack, fsAdvicePack];

const SPEC: AgentSpec = {
	id: '77777777-7777-4777-8777-777777777777',
	name: 'Complaintsbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: complaintsDesk.senses.map((sense) => sense.id) },
		actions: { enabled: complaintsDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-advice/complaint-charges-error',
	createdAt: '2026-09-12T09:00:00Z',
	updatedAt: '2026-09-12T09:00:00Z',
	schemaVersion: 1
};

const pop = population(1, { size: 400 });
const items = complaintBook(pop).items;

async function runItem(
	item: WorkItem,
	configuration?: ComplaintsConfigurationId,
	ordinal = 0,
	decide: Record<string, string> = {}
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(complaintsWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: COMPLAINTS_CONFIGURATIONS[configuration] } : {}),
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		...(Object.keys(decide).length > 0
			? { human: (stage: { id: string }) => ({ decision: decide[stage.id] ?? 'confirm' }) }
			: {}),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const outcomeOf = (run: WorkflowRun): string | undefined =>
	(run.stages.find((stage) => stage.stageId === 'decision')?.output.value as { decision?: string })
		?.decision;
const redressOf = (run: WorkflowRun): number | undefined =>
	(run.stages.find((stage) => stage.stageId === 'redress')?.output.value as { amount?: number })
		?.amount;

describe('the work-item layout', () => {
	it('puts the register’s complaint on the desk with the item’s customer and category, and the kind’s truth beneath', () => {
		const item = items[0]!;
		const world = complaintsDesk.create(COMPLAINTS_WORK_ITEM_LAYOUT, {
			random: () => 0.5,
			config: { item }
		});
		const state = world.snapshot() as {
			extra: { complaints: { complaintId: string; category: string } };
		};
		const payload = item.payload as { complaint: { id: string; category: string } };
		expect(state.extra.complaints.complaintId).toBe(payload.complaint.id);
		expect(state.extra.complaints.category).toBe(payload.complaint.category);
		const built = complaintCaseFromItem(() => 0.5, item);
		expect(built.truth.facts?.['well_founded']).toBe(
			upheldByTheRegister(payload.complaint.category)
		);
		expect(() => complaintCaseFromItem(() => 0.5, { ...item, payload: {} })).toThrow(
			/no complaint/
		);
	});
});

describe('the complaints journey over the register', { timeout: 300_000 }, () => {
	const sample = items.slice(0, 12);

	it('rules-only agrees with the register on every complaint: upheld ones redressed, the rest declined, a person only at the approval', async () => {
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			const category = (item.payload as { complaint: { category: string } }).complaint.category;
			expect(run.outcome, item.id).toBe('completed');
			expect(outcomeOf(run), item.id).toBe(upheldByTheRegister(category) ? 'uphold' : 'decline');
			const touched = touchedCaseOf(run, complaintsWorkflow.decisionKindOf);
			expect(touched.touches.map((touch) => touch.kind)).toEqual(
				upheldByTheRegister(category) ? ['human:approve'] : []
			);
			if (upheldByTheRegister(category)) expect(redressOf(run)).toBeGreaterThan(0);
			expect(run.stages.at(-1)?.stageId).toBe('close');
		}
	});

	it('the five configurations run over the same complaints, each a valid run that closes with the same outcome', async () => {
		const ids = Object.keys(COMPLAINTS_CONFIGURATIONS) as ComplaintsConfigurationId[];
		for (const [index, item] of sample.slice(0, 3).entries()) {
			const outcomes = new Set<string | undefined>();
			for (const configuration of ids) {
				const run = await runItem(item, configuration, index * 10 + ids.indexOf(configuration));
				expect(() => workflowRunSchema.parse(run)).not.toThrow();
				expect(run.outcome, `${item.id} ${configuration}`).toBe('completed');
				expect(run.stages.at(-1)?.stageId).toBe('close');
				outcomes.add(outcomeOf(run));
			}
			expect(outcomes.size).toBe(1);
		}
	});

	it('the redress is within the limit at the register’s fair sums, and the ceilings read it', () => {
		expect(complaintsDecisionKind('redress', { amount: 30 })).toBe('redress-within-limit');
		expect(complaintsDecisionKind('redress', { amount: 300 })).toBe('redress-above-limit');
		expect(complaintsDecisionKind('redress', { amount: 300 }, { redressLimit: 500 })).toBe(
			'redress-within-limit'
		);
		expect(complaintsDecisionKind('decision', { decision: 'decline' })).toBe('complaint-declined');
		expect(complaintsDecisionKind('decision', { decision: 'uphold' })).toBeUndefined();
	});

	it('the bot redresses an upheld complaint within the fair range, reading the category off the record', async () => {
		const upheld = sample.find((item) =>
			upheldByTheRegister((item.payload as { complaint: { category: string } }).complaint.category)
		)!;
		const run = await runItem(upheld, 'bot-everywhere', 60);
		expect(run.outcome).toBe('completed');
		expect(run.stages.find((stage) => stage.stageId === 'redress')?.status).toBe('ok');
		expect(redressOf(run)).toBeGreaterThan(0);
	});

	it('a returned approval closes the complaint declined', async () => {
		const upheld = sample.find((item) =>
			upheldByTheRegister((item.payload as { complaint: { category: string } }).complaint.category)
		)!;
		const run = await runItem(upheld, 'bot-with-a-person-at-approval', 50, { approve: 'return' });
		expect(run.outcome).toBe('completed');
		expect(run.stages.map((stage) => stage.stageId)).not.toContain('redress');
		expect(run.stages.at(-1)?.stageId).toBe('close');
	});
});

/**
 * The committed golden run (`77-…` §6's pattern): regenerate with
 * `npx vitest run src/complaints/workflow.test.ts -u` when the journey changes, and say so in `94-…`.
 */
export async function complaintsWorkflowFixture(): Promise<StoredWorkflowRun> {
	const item = items[0]!;
	const clock = createTestClock({ idOffset: 9000 });
	const seat = createTestClock({ idOffset: 9500 });
	const run = await runWorkflow(complaintsWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		config: COMPLAINTS_CONFIGURATIONS['bot-with-a-person-at-approval'],
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
		source: { kind: 'harness', build: 'bot-with-a-person-at-approval' },
		createdAt: run.finishedAt,
		schemaVersion: 1
	};
}

describe('fixtures/complaints-workflow-run.v1.json', () => {
	it('matches the committed fixture exactly', async () => {
		const stored = await complaintsWorkflowFixture();
		expect(stored.run.outcome).toBe('completed');
		await expect(JSON.stringify(stored, null, '\t')).toMatchFileSnapshot(
			'../fixtures/complaints-workflow-run.v1.json'
		);
	});
});

describe('the handoff from fraud (WP102, `83-…` §6.5.3)', { timeout: 300_000 }, () => {
	it('is followed into the complaints journey with the item’s truth carried, and the pair replays byte-identically', async () => {
		const registry = createPackRegistry();
		for (const pack of PACKS) registry.registerPack(pack);
		const complaint: WorkItem = {
			id: 'complaint-from-fraud',
			kind: 'complaint',
			customerId: items[0]!.customerId,
			arrivedAt: '1970-01-01T00:00:00.000Z',
			payload: {
				complaint: {
					id: 'cmp-alert-1',
					customerId: items[0]!.customerId,
					openedDay: 0,
					category: 'fraud-handling',
					summary: 'Account frozen on a payment I made myself.',
					status: 'open'
				},
				customer: (items[0]!.payload as { customer: unknown }).customer
			},
			truth: {
				records: [],
				facts: { category: 'fraud-handling', upheld: false }
			}
		};
		// A fraud run that ended by handing this complaint on (the record's shape; the fraud pack's own test makes one for real).
		const source: WorkflowRun = {
			schemaVersion: 1,
			id: '00000000-0000-4000-8000-00000000f00d',
			workflowId: 'fs-fraud/fraud',
			itemId: 'alert-1',
			config: {},
			startedAt: '2026-08-12T10:00:00.000Z',
			finishedAt: '2026-08-12T10:00:30.000Z',
			outcome: 'handed-off',
			handoff: { to: 'fs-advice/complaints', itemId: complaint.id, item: complaint },
			stages: [],
			runIds: [],
			events: [],
			digest: 'd'
		};
		const twice = await Promise.all(
			[1, 2].map(async () => {
				const clock = createTestClock({ idOffset: 7000 });
				const seat = createTestClock({ idOffset: 7500 });
				return followHandoff(source, registry, {
					packs: PACKS,
					spec: SPEC,
					config: COMPLAINTS_CONFIGURATIONS['rules-only'],
					providerFor: (_stage, goalCardId) =>
						createMockProvider({ script: obedient(planFor(goalCardId)) }),
					now: clock.now,
					newId: clock.newId,
					random: clock.random,
					session: { now: seat.now, newId: seat.newId, random: seat.random }
				});
			})
		);
		const [first, second] = twice;
		expect(first).toBeDefined();
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
		expect(first?.workflowId).toBe('fs-advice/complaints');
		expect(first?.itemId).toBe(complaint.id);
		expect(first?.handoffs).toEqual([
			{ runId: source.id, workflowId: 'fs-fraud/fraud', itemId: 'alert-1' }
		]);
		// The register does not uphold a fraud-handling complaint: declined, the truth carried on the item.
		expect(outcomeOf(first!)).toBe('decline');
		expect(first?.outcome).toBe('completed');
	});
});

// The fixture file the Workflows page imports (its shape is the Pipeline's e2e fixture's).
export const FIXTURE_PATH = new URL('../fixtures/complaints-workflow-run.v1.json', import.meta.url);
export const readFixture = (): unknown => JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as unknown;
