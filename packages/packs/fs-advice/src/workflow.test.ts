import {
	workflowRunSchema,
	type AgentSpec,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { adviceRequestBook, population } from '@craftabot/pack-fs-bank';
import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import fsAdvicePack, {
	ADVICE_CEILINGS,
	ADVICE_CONFIGURATION_IDS,
	ADVICE_CONFIGURATIONS,
	WORK_ITEM_LAYOUT,
	adviceCaseFromItem,
	adviceDecisionKind,
	adviceDesk,
	adviceWorkflow,
	PRODUCT,
	untag,
	type AdviceConfigurationId
} from './index.js';
import { planFor } from './testing/plans.js';

/**
 * **The advice journey over the register** (WP85, `76-…` §6): the work-item
 * layout carries the request's customer and balance; `rules-only` runs the
 * fact-find and recommends from the suitable set or refers; the five
 * configurations complete over the same requests; consent gates the order
 * below Level 5 and the bot's own go-ahead executes it at Level 5; the
 * breach rate is zero at Level 2 and counts at Level 5; the run's own
 * events are stage boundaries and rule actions only.
 */
const PACKS = [starterPack, fsBankPack, fsAdvicePack];

const SPEC: AgentSpec = {
	id: '66666666-6666-4666-8666-666666666666',
	name: 'Advicebot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: adviceDesk.senses.map((sense) => sense.id) },
		actions: { enabled: adviceDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-advice/advise/inheritance',
	createdAt: '2026-09-06T09:00:00Z',
	updatedAt: '2026-09-06T09:00:00Z',
	schemaVersion: 1
};

const pop = population(1, { size: 1_200 });
const items = adviceRequestBook(pop).items;

async function runItem(
	item: WorkItem,
	configuration?: AdviceConfigurationId,
	ordinal = 0,
	decide: Record<string, string> = {}
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(adviceWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: ADVICE_CONFIGURATIONS[configuration] } : {}),
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		...(Object.keys(decide).length > 0
			? { human: (stage: { id: string }) => ({ decision: decide[stage.id] ?? 'proceed' }) }
			: {}),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const stageOutput = (run: WorkflowRun, id: string) =>
	run.stages.find((stage) => stage.stageId === id)?.output.value as
		Record<string, unknown> | undefined;
const recommended = (run: WorkflowRun): string | undefined =>
	stageOutput(run, 'recommendation')?.['productId'] as string | undefined;
const executed = (run: WorkflowRun): boolean => stageOutput(run, 'execution') !== undefined;

describe('the work-item layout', () => {
	it('puts the request’s customer on the desk with the balance they hold, the answers hidden, the suitable set in truth', () => {
		expect(items.length).toBeGreaterThan(5);
		const item = items[0]!;
		const built = adviceCaseFromItem(createTestClock().random, item);
		const payload = item.payload as { customer: { id: string }; savingsBalance: number };
		expect(built.bank.customer.id).toBe(payload.customer.id);
		expect(built.answers.amount).toBe(payload.savingsBalance);
		expect(built.extra.advice.answers?.amount).toBe(payload.savingsBalance);
		expect((built.hidden ?? []).filter((record) => record.kind === 'answer')).toHaveLength(7);
		expect(built.truth.records.find((record) => record.id === 'suitable-set')).toBeDefined();
		expect(built.extra.bank.customer.cohort.protectedProxies).toEqual([]);
		// Bare — the conformance sweep's way — it is still a case.
		expect(adviceDesk.create(WORK_ITEM_LAYOUT).snapshot()).toBeDefined();
	});
});

describe('the advice workflow over the register', { timeout: 300_000 }, () => {
	const sample = items.slice(0, 12);

	it('rules-only runs the fact-find and recommends from the suitable set, or refers; a person consents before the order', async () => {
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			expect(run.outcome, `${item.id}: ${run.stages.at(-1)?.finding ?? ''}`).toBe('completed');
			expect(run.runIds).toEqual([]);
			const built = adviceCaseFromItem(createTestClock().random, item);
			const suitable = untag(
				String(
					built.truth.records.find((record) => record.id === 'suitable-set')?.fields[
						'product_ids'
					] ?? ''
				)
			);
			const product = recommended(run);
			if (product !== undefined) {
				expect(
					suitable.map((bare) => PRODUCT(bare)),
					item.id
				).toContain(product);
				expect(run.stages.map((stage) => stage.stageId)).toContain('consent');
				expect(executed(run)).toBe(true);
				expect(touchedCaseOf(run, adviceDecisionKind).touches.map((t) => t.kind)).toEqual([
					'human:consent'
				]);
			} else {
				expect(suitable).toEqual([]);
				expect(stageOutput(run, 'recommendation')?.['referred']).toBe(true);
				expect(run.stages.map((stage) => stage.stageId)).not.toContain('consent');
			}
		}
	});

	it('the five configurations run over the same requests, each a valid run that completes, agreeing on the product', async () => {
		const products = new Map<string, Set<string>>();
		for (const configuration of ADVICE_CONFIGURATION_IDS) {
			for (const [index, item] of sample.slice(0, 5).entries()) {
				const run = await runItem(item, configuration, index);
				expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(run))).success).toBe(true);
				expect(
					run.outcome,
					`${configuration} ${item.id}: ${run.stages.at(-1)?.finding ?? ''}`
				).toBe('completed');
				const set = products.get(item.id) ?? new Set<string>();
				set.add(recommended(run) ?? 'referred');
				products.set(item.id, set);
			}
		}
		for (const [id, set] of products) expect([...set], id).toHaveLength(1);
	});

	it('consent gates the order below Level 5; the bot’s own go-ahead executes it at Level 5', async () => {
		const item = sample.find((candidate) => {
			const built = adviceCaseFromItem(createTestClock().random, candidate);
			return (
				String(
					built.truth.records.find((r) => r.id === 'suitable-set')?.fields['cheapest'] ?? ''
				) !== ''
			);
		})!;
		expect(item).toBeDefined();
		const declined = await runItem(item, 'bot-with-a-person-at-execution', 1, {
			consent: 'decline'
		});
		expect(declined.outcome).toBe('completed');
		expect(executed(declined)).toBe(false);
		expect(declined.stages.find((stage) => stage.stageId === 'consent')?.executor.kind).toBe(
			'human'
		);
		const everywhere = await runItem(item, 'bot-everywhere', 2);
		expect(everywhere.outcome).toBe('completed');
		expect(everywhere.stages.find((stage) => stage.stageId === 'consent')?.executor.kind).toBe(
			'rule'
		);
		expect(executed(everywhere)).toBe(true);
		expect(everywhere.runIds.length).toBeGreaterThanOrEqual(4);
	});

	it('the ceiling-breach rate is zero at Level 2 and counts the recommendation and the order at Level 5', async () => {
		const breaches = async (configuration: AdviceConfigurationId) => {
			let count = 0;
			let orders = 0;
			for (const [index, item] of sample.slice(0, 4).entries()) {
				const run = await runItem(item, configuration, index);
				if (executed(run)) orders += 1;
				for (const decision of touchedCaseOf(run, adviceDecisionKind).decisions ?? []) {
					if (decision.level > (ADVICE_CEILINGS[decision.kind] ?? 5)) count += 1;
				}
			}
			return { count, orders };
		};
		expect((await breaches('bot-gathers-only')).count).toBe(0);
		const everywhere = await breaches('bot-everywhere');
		// Every recommendation (ceiling 3) and every order (ceiling 4) sits above Level 5's ceiling.
		expect(everywhere.count).toBe(everywhere.orders * 2);
	});

	it('the run’s own events are stage boundaries and rule actions only', async () => {
		const run = await runItem(sample[0]!, 'bot-everywhere', 9);
		for (const event of run.events)
			expect(['stage.started', 'stage.completed', 'action.performed']).toContain(event.type);
		// A bot stage's boundary is on its own agent run's trace; the rest are here.
		expect(run.events.filter((event) => event.type === 'stage.completed')).toHaveLength(
			run.stages.filter((stage) => stage.executor.kind !== 'agent').length
		);
	});

	it('the intake refuses a malformed work item with a finding', async () => {
		const payload = sample[0]!.payload as { customer: object; savingsBalance: number };
		const malformed: WorkItem = { ...sample[0]!, payload: { ...payload, topic: 42 } };
		const run = await runItem(malformed, 'rules-only');
		expect(run.outcome).toBe('stopped');
		expect(run.stages[0]).toMatchObject({ stageId: 'request', status: 'error' });
	});
});
