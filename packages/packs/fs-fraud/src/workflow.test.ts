import {
	workflowRunSchema,
	type AgentSpec,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { alertBook, population } from '@craftabot/pack-fs-bank';
import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import fsFraudPack, {
	FRAUD_CEILINGS,
	FRAUD_CONFIGURATION_IDS,
	FRAUD_CONFIGURATIONS,
	WORK_ITEM_LAYOUT,
	fraudCaseFromItem,
	fraudDecisionKind,
	fraudDesk,
	fraudWorkflow,
	type FraudConfigurationId
} from './index.js';
import { planFor } from './testing/plans.js';

/**
 * **The alert journey over the book** (WP85, `76-…` §6): the work-item layout
 * carries the alert and its label; `rules-only` holds every alert, so its
 * precision and recall over the book are the rule's own (WP75's calibration
 * test); the five configurations complete over the same alerts; the SAR
 * stage is a person's below Level 5 and the bot's at Level 5, and `filing`
 * files only after *file*; the breach rate is zero at Level 3 and one per
 * alert at Level 5; the run's own events are stage boundaries and rule
 * actions only.
 */
const PACKS = [starterPack, fsBankPack, fsFraudPack];

const SPEC: AgentSpec = {
	id: '55555555-5555-4555-8555-555555555555',
	name: 'Fraudbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: fraudDesk.senses.map((sense) => sense.id) },
		actions: { enabled: fraudDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-fraud/account-takeover',
	createdAt: '2026-09-06T09:00:00Z',
	updatedAt: '2026-09-06T09:00:00Z',
	schemaVersion: 1
};

const pop = population(1, { size: 600 });
const drawn = alertBook(pop);
const items = drawn.book.items;

async function runItem(
	item: WorkItem,
	configuration?: FraudConfigurationId,
	ordinal = 0,
	decide: Record<string, string> = {}
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(fraudWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: FRAUD_CONFIGURATIONS[configuration] } : {}),
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		...(Object.keys(decide).length > 0
			? { human: (stage: { id: string }) => ({ decision: decide[stage.id] ?? 'skip' }) }
			: {}),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const restriction = (run: WorkflowRun): string | undefined =>
	(
		run.stages.find((stage) => stage.stageId === 'restriction')?.output.value as {
			decision?: string;
		}
	)?.decision;
const filed = (run: WorkflowRun): boolean =>
	(run.stages.find((stage) => stage.stageId === 'filing')?.output.value as { filed?: boolean })
		?.filed === true;

describe('the work-item layout', () => {
	it('puts the rule’s alert on the desk as alert 1 with its label in truth and its signals on the record', () => {
		expect(items.length).toBeGreaterThan(10);
		const item = items[0]!;
		const built = fraudCaseFromItem(createTestClock().random, item);
		expect(built.fraudAlerts).toHaveLength(1);
		expect(built.fraudAlerts[0]?.label).toBe(item.truth.facts?.['label']);
		expect(built.queue.map((entry) => entry.id)).toEqual(['alert-1']);
		const record = built.revealed.find((entry) => entry.id === 'alert-1');
		expect(String(record?.fields['signals'])).toBe(
			(item.payload as { signals: string[] }).signals.join(',')
		);
		expect(built.truth.facts?.['focalAlert']).toBe('alert-1');
		expect(built.truth.records.find((entry) => entry.id === 'alert-truth-1')?.fields['label']).toBe(
			item.truth.facts?.['label']
		);
		expect(built.extra.bank.customer.cohort.protectedProxies).toEqual([]);
		// Bare — the conformance sweep's way — it is still a case.
		expect(fraudDesk.create(WORK_ITEM_LAYOUT).snapshot()).toBeDefined();
	});
});

describe('the fraud workflow over the alert book', { timeout: 300_000 }, () => {
	const sample = items.slice(0, 30);

	it('rules-only is the detector alone: every alert held, a person asked about the SAR, precision and recall the book’s', async () => {
		let held = 0;
		let planted = 0;
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			expect(run.outcome, item.id).toBe('completed');
			expect(run.runIds).toEqual([]);
			expect(restriction(run)).toBe('hold');
			expect(run.stages.map((stage) => stage.stageId)).toEqual([
				'alert',
				'triage',
				'contact',
				'decision',
				'restriction',
				'sar',
				'filing',
				'note'
			]);
			expect(filed(run)).toBe(false);
			const touched = touchedCaseOf(run, fraudDecisionKind);
			expect(touched.touches.map((touch) => touch.kind)).toEqual(['human:sar']);
			held += 1;
			if (item.truth.facts?.['planted'] === true) planted += 1;
		}
		// Over the whole book, holding every alert the rule raised is the rule's own precision and recall.
		const plantedInBook = items.filter((item) => item.truth.facts?.['planted'] === true).length;
		expect(plantedInBook / items.length).toBeCloseTo(drawn.precision, 10);
		expect(plantedInBook / drawn.planted).toBeCloseTo(drawn.recall, 10);
		expect(held).toBe(sample.length);
		expect(planted).toBeLessThanOrEqual(held);
	});

	it('the five configurations run over the same alerts, each a valid run that completes', async () => {
		for (const configuration of FRAUD_CONFIGURATION_IDS) {
			for (const [index, item] of sample.slice(0, 6).entries()) {
				const run = await runItem(item, configuration, index);
				expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(run))).success).toBe(true);
				expect(
					run.outcome,
					`${configuration} ${item.id}: ${run.stages.at(-1)?.finding ?? ''}`
				).toBe('completed');
				expect(restriction(run)).toBe('hold');
			}
		}
	});

	it('the SAR is a person’s below Level 5 and files only after “file”; the bot files it at Level 5', async () => {
		const item = sample[0]!;
		const skipped = await runItem(item, 'bot-with-a-person-at-the-sar', 1);
		expect(skipped.stages.find((stage) => stage.stageId === 'sar')?.executor.kind).toBe('human');
		expect(filed(skipped)).toBe(false);
		const filedByAPerson = await runItem(item, 'bot-with-a-person-at-the-sar', 2, { sar: 'file' });
		expect(filed(filedByAPerson)).toBe(true);
		const everywhere = await runItem(item, 'bot-everywhere', 3);
		expect(everywhere.stages.find((stage) => stage.stageId === 'sar')?.executor.kind).toBe('agent');
		expect(filed(everywhere)).toBe(true);
		expect(everywhere.runIds.length).toBeGreaterThanOrEqual(4);
	});

	it('the ceiling-breach rate is zero at Level 3 and one per alert at Level 5', async () => {
		const breaches = async (
			configuration: FraudConfigurationId,
			decide?: Record<string, string>
		) => {
			let count = 0;
			for (const [index, item] of sample.slice(0, 4).entries()) {
				const run = await runItem(item, configuration, index, decide ?? {});
				const touched = touchedCaseOf(run, fraudDecisionKind);
				for (const decision of touched.decisions ?? []) {
					if (decision.level > (FRAUD_CEILINGS[decision.kind] ?? 5)) count += 1;
				}
			}
			return count;
		};
		expect(await breaches('bot-recommends', { decision: 'hold' })).toBe(0);
		// Level 5: the restriction (ceiling 3) and the SAR (ceiling 2), both above the ceiling.
		expect(await breaches('bot-everywhere')).toBe(8);
	});

	it('the run’s own events are stage boundaries and rule actions only', async () => {
		const run = await runItem(sample[1]!, 'bot-everywhere', 9);
		const types = new Set(run.events.map((event) => event.type));
		for (const type of types)
			expect(['stage.started', 'stage.completed', 'action.performed']).toContain(type);
		// A bot stage's boundary is on its own agent run's trace; the rest are here.
		expect(run.events.filter((event) => event.type === 'stage.completed')).toHaveLength(
			run.stages.filter((stage) => stage.executor.kind !== 'agent').length
		);
	});

	it('the intake refuses a malformed work item with a finding', async () => {
		const payload = sample[0]!.payload as {
			transaction: object;
			account: object;
			signals: string[];
		};
		const malformed: WorkItem = {
			...sample[0]!,
			payload: { ...payload, transaction: { ...payload.transaction, amount: 'lots' } }
		};
		const run = await runItem(malformed, 'rules-only');
		expect(run.outcome).toBe('stopped');
		expect(run.stages[0]).toMatchObject({ stageId: 'alert', status: 'error' });
	});
});

describe('the handoff to complaints (WP102, `83-…` §6.5.3)', { timeout: 300_000 }, () => {
	it('hands a disputed restriction to the complaints journey as a complaint item carrying the register’s truth', async () => {
		// A person freezes the account of a caller the bot verified: the customer disputes it.
		const run = await runItem(items[0]!, 'bot-recommends', 70, { decision: 'freeze', sar: 'skip' });
		expect(run.outcome).toBe('handed-off');
		expect(run.handoff?.to).toBe('fs-advice/complaints');
		expect(run.handoff?.item.kind).toBe('complaint');
		// The desk's own customer (the alert item carries an account, not a customer record): the case's, on the register's shape.
		expect(run.handoff?.item.customerId).toMatch(/^cust-/);
		expect(run.handoff?.item.id).toContain('alert-1');
		expect(run.handoff?.item.truth.facts).toEqual({ category: 'fraud-handling', upheld: false });
		expect(run.stages.at(-1)?.stageId).toBe('note');
		expect(() => workflowRunSchema.parse(run)).not.toThrow();
	});

	it('does not hand off a hold', async () => {
		const held = await runItem(items[0]!, 'bot-recommends', 71, { decision: 'hold', sar: 'skip' });
		expect(held.outcome).toBe('completed');
	});
});
