import {
	workflowRunSchema,
	type AgentSpec,
	type DeskWorldState,
	type PackManifest,
	type WorkItem,
	type WorkflowRun
} from '@craftabot/core';
import { createMockProvider, createTestClock, obedient } from '@craftabot/core/testing';
import { population } from '@craftabot/pack-fs-bank';
import fsBankPack from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { runWorkflow, stageCardId, touchedCaseOf } from '@craftabot/workflow';
import { stageBoundaryGuardrails } from '@craftabot/governance';
import monitorPack from '@craftabot/pack-monitor';
import { createPackRegistry, type WorkflowSpec } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { LENDING_CEILINGS } from './decision-rights.js';
import fsLendingPack from './index.js';
import { planFor } from './testing/plans.js';
import { lendingBook } from './book.js';
import { lendingCaseFromItem } from './world/cases.js';
import { lendingDesk, WORK_ITEM_LAYOUT } from './world/desk.js';
import { DEFAULT_LENDING_POLICY, affordabilityVerdictWith } from './world/rules.js';
import {
	LENDING_CONFIGURATION_IDS,
	LENDING_CONFIGURATIONS,
	lendingDecisionKind,
	lendingWorkflow,
	type LendingConfigurationId
} from './workflow.js';

/**
 * **The lending workflow** (WP80, `73-…` §7; `65-…` WP80's DoD): the five
 * configurations over the same book, `rules-only` agreeing with the rule
 * on every row, the ceiling-breach on declines at Level 5 and not at
 * Level 3, the intake refusing a malformed item, the work-item layout the
 * case it claims to be.
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
const PACKS = [starterPack, fsBankPack, fsLendingPack, CARTRIDGES];

const SPEC: AgentSpec = {
	id: '44444444-4444-4444-8444-444444444444',
	name: 'Deskbot',
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

const pop = population(1, { size: 400 });
const book = lendingBook(pop);
const items = book.book.items;

async function runItem(
	item: WorkItem,
	configuration?: LendingConfigurationId,
	ordinal = 0
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(lendingWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: LENDING_CONFIGURATIONS[configuration] } : {}),
		providerFor: (_stage, goalCardId) =>
			createMockProvider({ script: obedient(planFor(goalCardId)) }),
		now: clock.now,
		newId: clock.newId,
		random: clock.random,
		session: { now: seat.now, newId: seat.newId, random: seat.random }
	});
}

const decidedOutcome = (run: WorkflowRun): string | undefined =>
	(run.stages.find((stage) => stage.stageId === 'record')?.output.value as { outcome?: string })
		?.outcome;

describe('the work-item layout', () => {
	it('puts the book’s applicant on the desk with the truth recomputed under the policy', () => {
		const item = items[0]!;
		const built = lendingCaseFromItem(createTestClock().random, item);
		const payload = item.payload as {
			application: { amount: number };
			applicant: { customer: { id: string } };
		};
		expect(built.application.amount).toBe(payload.application.amount);
		expect(built.bank.customer.id).toBe(payload.applicant.customer.id);
		expect(built.truth.facts?.['verdict']).toBe(item.truth.facts?.['verdict']);
		// The desk's own view: no cohort proxies, the disclosed vulnerability only.
		expect(built.extra.bank.customer.cohort.protectedProxies).toEqual([]);
		const world = lendingDesk.create(WORK_ITEM_LAYOUT, { config: { item } });
		const snapshot = world.snapshot() as DeskWorldState;
		expect(snapshot.records.some((record) => record.id === 'application')).toBe(true);
		// Bare — the conformance sweep's way — it is still a case.
		expect((lendingDesk.create(WORK_ITEM_LAYOUT).snapshot() as DeskWorldState).queue).toHaveLength(
			1
		);
	});
});

describe('the lending workflow over the book', { timeout: 300_000 }, () => {
	const sample = items.slice(0, 40);

	it('rules-only agrees with the rule on every row, touching a person only at the payout', async () => {
		const judge = affordabilityVerdictWith(DEFAULT_LENDING_POLICY);
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			expect(run.outcome, item.id).toBe('completed');
			expect(run.runIds).toEqual([]);
			const payload = item.payload as {
				application: Parameters<typeof judge>[0];
				applicant: { bureau: Parameters<typeof judge>[1] };
			};
			const expected = judge(payload.application, payload.applicant.bureau).verdict;
			expect(decidedOutcome(run), item.id).toBe(expected);
			expect(item.truth.facts?.['verdict']).toBe(`should-${expected}`);
			const touched = touchedCaseOf(run, lendingDecisionKind);
			const fourEyes = run.stages.some((stage) => stage.stageId === 'four-eyes');
			expect(fourEyes).toBe(expected === 'approve');
			expect(touched.touches.map((touch) => touch.kind)).toEqual(
				fourEyes ? ['human:four-eyes'] : []
			);
			expect(run.stages.some((stage) => stage.stageId === 'disbursement')).toBe(
				expected === 'approve'
			);
		}
	});

	it('the five configurations run over the same items, each a valid run, agreeing on the outcome', async () => {
		const outcomes = new Map<string, Set<string>>();
		for (const configuration of LENDING_CONFIGURATION_IDS) {
			for (const [index, item] of sample.slice(0, 12).entries()) {
				const run = await runItem(item, configuration, index);
				expect(workflowRunSchema.safeParse(JSON.parse(JSON.stringify(run))).success).toBe(true);
				expect(
					run.outcome,
					`${configuration} ${item.id}: ${run.stages.at(-1)?.finding ?? ''}`
				).toBe('completed');
				const set = outcomes.get(item.id) ?? new Set<string>();
				set.add(decidedOutcome(run) ?? 'none');
				outcomes.set(item.id, set);
			}
		}
		for (const [id, set] of outcomes) expect([...set], id).toHaveLength(1);
	});

	it('a bot stage’s trace carries the stage boundary and the agent runs are on the record', async () => {
		const run = await runItem(sample[0]!, 'bot-everywhere');
		const agentStages = run.stages.filter((stage) => stage.executor.kind === 'agent');
		expect(agentStages.length).toBeGreaterThanOrEqual(4);
		expect(run.runIds).toHaveLength(agentStages.length);
		expect(agentStages.every((stage) => stage.runId !== undefined)).toBe(true);
	});

	it('the ceiling-breach rate is zero at Level 3 and non-zero for declines at Level 5', async () => {
		const declines = sample
			.filter((item) => item.truth.facts?.['verdict'] === 'should-decline')
			.slice(0, 5);
		expect(declines.length).toBeGreaterThan(0);
		const breaches = async (configuration: LendingConfigurationId) => {
			let count = 0;
			for (const [index, item] of declines.entries()) {
				const run = await runItem(item, configuration, index);
				const touched = touchedCaseOf(run, lendingDecisionKind);
				for (const decision of touched.decisions ?? []) {
					if (decision.level > (LENDING_CEILINGS[decision.kind] ?? 5)) count += 1;
				}
			}
			return count;
		};
		expect(await breaches('bot-recommends')).toBe(0);
		expect(await breaches('bot-everywhere')).toBe(declines.length);
	});

	it('the intake refuses a malformed work item with a finding', async () => {
		const malformed: WorkItem = {
			...sample[0]!,
			payload: { application: { amount: 'lots', termMonths: 12 } }
		};
		const run = await runItem(malformed, 'rules-only');
		expect(run.outcome).toBe('stopped');
		expect(run.stages).toHaveLength(1);
		expect(run.stages[0]).toMatchObject({ stageId: 'intake', status: 'error' });
		expect(run.stages[0]?.finding).toContain('input rejected');
	});

	it('a knob moves the rules-only outcome and never the case', async () => {
		const refer = sample.find((item) => item.truth.facts?.['verdict'] === 'should-refer')!;
		const strict = LENDING_CONFIGURATIONS['rules-only'];
		const loose = {
			...strict,
			knobs: { referRatioPercent: 999, referOnFair: false, referOnSearches: 99 }
		};
		const a = await runItem(refer, 'rules-only');
		const b = await runWorkflow(lendingWorkflow, refer, {
			packs: PACKS,
			spec: SPEC,
			config: loose,
			providerFor: () => createMockProvider({ script: [] }),
			now: createTestClock().now,
			newId: createTestClock().newId
		});
		expect(decidedOutcome(a)).toBe('refer');
		expect(['approve', 'refer']).toContain(decidedOutcome(b));
		expect(a.stages[0]?.input.digest).toBe(b.stages[0]?.input.digest);
	});
});

describe('the reference configurations', () => {
	it('carry their autonomy level and the ceilings from the decision-rights table', () => {
		expect(LENDING_CONFIGURATIONS['rules-only'].autonomy).toBeUndefined();
		expect(LENDING_CONFIGURATIONS['bot-explains-only'].autonomy?.level).toBe(2);
		expect(LENDING_CONFIGURATIONS['bot-recommends'].autonomy?.level).toBe(3);
		expect(LENDING_CONFIGURATIONS['bot-with-a-person-at-the-decision'].autonomy?.level).toBe(4);
		expect(LENDING_CONFIGURATIONS['bot-everywhere'].autonomy).toEqual({
			level: 5,
			ceilings: LENDING_CEILINGS
		});
		expect(LENDING_CEILINGS).toEqual({
			'in-policy-credit-approval': 4,
			'adverse-credit-decision': 3,
			'vulnerable-customer-support': 3,
			'sar-filing': 2
		});
		expect(lendingWorkflow.configurations).toBe(LENDING_CONFIGURATIONS);
		expect(fsLendingPack.workflows?.map((workflow) => workflow.id)).toEqual(['fs-lending/lending']);
	});

	it('draws a book at a seed and size', () => {
		const drawn = lendingWorkflow.book!({ seed: 1, size: 100 });
		expect(drawn.kind).toBe('application');
		expect(drawn.source).toMatchObject({ seed: 1, size: 100 });
		expect(drawn.items.length).toBeGreaterThan(0);
	});
});

/**
 * **A stage-out breaker on the decision stage** (WP95, `84-…` WP95's DoD):
 * the evaluator breaker fitted at the lending `decision` stage's boundary,
 * over the bot's own run, fails a planted over-approve — the bot approving a
 * case the rule declines — and the stage reads `blocked` with the verdict on
 * its record; the same guard lets the rule-matching decision through.
 */
describe('a stage-out breaker on the decision stage (WP95)', { timeout: 120_000 }, () => {
	const guarded: WorkflowSpec = {
		...lendingWorkflow,
		stages: lendingWorkflow.stages.map((stage) =>
			stage.id === 'decision'
				? {
						...stage,
						guards: {
							components: [
								{
									id: 'monitor/evaluator-breaker',
									config: { evaluatorId: 'fs-lending/decision-matches-rules', onFail: true },
									point: 'stage-out' as const
								}
							]
						}
					}
				: stage
		)
	};
	const packs = [...PACKS, monitorPack];
	const registry = createPackRegistry();
	for (const pack of packs) registry.registerPack(pack);
	const decisionCard = stageCardId(lendingWorkflow.id, 'decision');

	async function runGuarded(item: WorkItem, overApprove: boolean, ordinal: number) {
		const clock = createTestClock({ idOffset: 9000 + ordinal * 1000 });
		const seat = createTestClock({ idOffset: 9500 + ordinal * 1000 });
		return runWorkflow(guarded, item, {
			packs,
			spec: SPEC,
			providerFor: (_stage, goalCardId) =>
				createMockProvider({
					script: obedient(
						overApprove && goalCardId === decisionCard
							? [
									{
										say: 'Approving regardless.',
										call: 'decide',
										args: { outcome: 'approve', reasons: ['affordable'] }
									}
								]
							: planFor(goalCardId)
					)
				}),
			boundaryGuardrailsFor: stageBoundaryGuardrails(registry),
			now: clock.now,
			newId: clock.newId,
			random: clock.random,
			session: { now: seat.now, newId: seat.newId, random: seat.random }
		});
	}

	it('fails a planted over-approve: the stage reads blocked, the journey stops, the verdict names the component', async () => {
		const item = items.find((entry) => entry.truth.facts?.['verdict'] === 'should-decline');
		expect(item).toBeDefined();
		const run = await runGuarded(item!, true, 0);
		const decision = run.stages.find((stage) => stage.stageId === 'decision');
		expect(decision?.status).toBe('blocked');
		expect(decision?.guards.verdicts).toMatchObject([
			{ componentId: 'monitor/evaluator-breaker', point: 'stage-out', verdict: 'stop-run' }
		]);
		expect(run.outcome).toBe('stopped');
		expect(run.stages.some((stage) => stage.stageId === 'record')).toBe(false);
	});

	it('lets the decision the rule gives through, the allow on the record', async () => {
		const item = items.find((entry) => entry.truth.facts?.['verdict'] === 'should-decline');
		const run = await runGuarded(item!, false, 1);
		const decision = run.stages.find((stage) => stage.stageId === 'decision');
		expect(decision?.status).toBe('ok');
		expect(decision?.guards.verdicts).toMatchObject([
			{ componentId: 'monitor/evaluator-breaker', point: 'stage-out', verdict: 'allow' }
		]);
		expect(run.outcome).toBe('completed');
	});
});
