import {
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
import { journeyLayout } from '@craftabot/workflow';
import { runWorkflow, touchedCaseOf } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { onboardingBook } from './book.js';
import { ONBOARDING_CEILINGS } from './decision-rights.js';
import fsOnboardingPack from './index.js';
import { planFor } from './testing/plans.js';
import { onboardingCaseFromItem } from './world/cases.js';
import { WORK_ITEM_LAYOUT, onboardingDesk } from './world/desk.js';
import { onboardingVerdict } from './world/rules.js';
import {
	ONBOARDING_CONFIGURATION_IDS,
	ONBOARDING_CONFIGURATIONS,
	onboardingDecisionKind,
	onboardingWorkflow,
	type OnboardingConfigurationId
} from './workflow.js';

/**
 * **The onboarding workflow** (WP103, `95-FS-ONBOARDING.md` §4.6): the
 * five configurations over the same book, `rules-only` agreeing with the
 * rule on every row — the mismatch declined at the identity stage without
 * a screening — the ceiling-breach on the open at Level 5 and not at Level
 * 3, the intake refusing a malformed item, the work-item layout the case
 * it claims to be, and the journey drawn with its two exits.
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
const PACKS = [starterPack, fsBankPack, fsOnboardingPack, CARTRIDGES];

const SPEC: AgentSpec = {
	id: '88888888-8888-4888-8888-888888888888',
	name: 'Deskbot',
	bricks: {
		llm: {
			cartridgeId: 'test/mock-brain',
			temperature: 0,
			maxTokens: 256,
			personality: 'You are the bank’s assistant.'
		},
		sense: { channels: onboardingDesk.senses.map((sense) => sense.id) },
		actions: { enabled: onboardingDesk.actions.map((action) => action.id) },
		memory: { windowSize: 10, notebook: true }
	},
	goalCardId: 'fs-onboarding/clean-open',
	createdAt: '2026-09-12T09:00:00Z',
	updatedAt: '2026-09-12T09:00:00Z',
	schemaVersion: 1
};

const pop = population(1, { size: 1200 });
const book = onboardingBook(pop);
const items = book.items;

async function runItem(
	item: WorkItem,
	configuration?: OnboardingConfigurationId,
	ordinal = 0
): Promise<WorkflowRun> {
	const clock = createTestClock({ idOffset: ordinal * 1000 });
	const seat = createTestClock({ idOffset: ordinal * 1000 + 500 });
	return runWorkflow(onboardingWorkflow, item, {
		packs: PACKS,
		spec: SPEC,
		...(configuration ? { config: ONBOARDING_CONFIGURATIONS[configuration] } : {}),
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
const payloadOf = (item: WorkItem) =>
	item.payload as {
		application: { given: { birthYear: number } };
		applicant: { customer: Parameters<typeof onboardingVerdict>[0] };
	};

describe('the work-item layout', () => {
	it('puts the book’s applicant on the desk with the truth recomputed', () => {
		const item = items[0]!;
		const built = onboardingCaseFromItem(createTestClock().random, item);
		expect(built.bank.customer.id).toBe(payloadOf(item).applicant.customer.id);
		expect(built.truth.facts?.['verdict']).toBe(item.truth.facts?.['verdict']);
		expect(built.truth.facts?.['hit']).toBe(item.truth.facts?.['hit']);
		expect(built.extra.bank.customer.cohort.protectedProxies).toEqual([]);
		const world = onboardingDesk.create(WORK_ITEM_LAYOUT, { config: { item } });
		const snapshot = world.snapshot() as DeskWorldState;
		expect(snapshot.records.some((record) => record.id === 'application')).toBe(true);
		expect(
			(onboardingDesk.create(WORK_ITEM_LAYOUT).snapshot() as DeskWorldState).queue
		).toHaveLength(1);
	});

	it('the book: every twelfth customer applies, a hit every fifth applicant, a mismatch every eighth', () => {
		expect(book.kind).toBe('onboarding');
		expect(items).toHaveLength(100);
		const hits = items.filter((item) => item.truth.facts?.['hit'] !== 'list-none');
		expect(hits).toHaveLength(20);
		const mismatches = items.filter((item) => item.truth.facts?.['verifies'] === false);
		expect(mismatches).toHaveLength(12);
		expect(mismatches.every((item) => item.truth.facts?.['verdict'] === 'should-decline')).toBe(
			true
		);
		expect(JSON.stringify(onboardingBook(population(1, { size: 1200 })))).toBe(
			JSON.stringify(book)
		);
	});
});

describe('the onboarding workflow over the book', { timeout: 300_000 }, () => {
	const sample = [
		...items.slice(0, 12),
		...items.filter((item) => item.truth.facts?.['hit'] !== 'list-none').slice(0, 2),
		...items.filter((item) => item.truth.facts?.['verifies'] === false).slice(0, 1)
	];

	it('rules-only agrees with the rule on every row, touching a person only at the open', async () => {
		for (const [index, item] of sample.entries()) {
			const run = await runItem(item, 'rules-only', index);
			expect(run.outcome, item.id).toBe('completed');
			expect(run.runIds).toEqual([]);
			const payload = payloadOf(item);
			const expected = onboardingVerdict(
				payload.applicant.customer,
				item.truth.facts?.['verifies'] === true
			).verdict;
			expect(decidedOutcome(run), item.id).toBe(expected);
			const touched = touchedCaseOf(run, onboardingDecisionKind);
			const confirmed = run.stages.some((stage) => stage.stageId === 'confirm');
			expect(confirmed).toBe(expected === 'approve');
			expect(touched.touches.map((touch) => touch.kind)).toEqual(
				confirmed ? ['human:confirm'] : []
			);
			expect(run.stages.some((stage) => stage.stageId === 'welcome')).toBe(expected === 'approve');
			// The mismatch never reaches the screening: declined on identity alone.
			if (item.truth.facts?.['verifies'] === false)
				expect(run.stages.map((stage) => stage.stageId)).toEqual([
					'application',
					'identity',
					'decision',
					'record'
				]);
		}
	});

	it('the five configurations run over the same items, each a valid run, agreeing on the outcome', async () => {
		const outcomes = new Map<string, Set<string>>();
		for (const configuration of ONBOARDING_CONFIGURATION_IDS) {
			for (const [index, item] of sample.slice(0, 6).concat(sample.slice(-3)).entries()) {
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

	it('a bot stage’s trace carries the agent runs on the record', async () => {
		const run = await runItem(sample[0]!, 'bot-everywhere');
		const agentStages = run.stages.filter((stage) => stage.executor.kind === 'agent');
		expect(agentStages.length).toBeGreaterThanOrEqual(4);
		expect(run.runIds).toHaveLength(agentStages.length);
		expect(agentStages.every((stage) => stage.runId !== undefined)).toBe(true);
	});

	it('the ceiling-breach rate is zero at Level 3 and non-zero at Level 5 — the open and the hit', async () => {
		const approve = sample
			.filter((item) => item.truth.facts?.['verdict'] === 'should-approve')
			.slice(0, 3);
		const hit = sample.filter((item) => item.truth.facts?.['hit'] !== 'list-none').slice(0, 1);
		const breaches = async (configuration: OnboardingConfigurationId, over: WorkItem[]) => {
			let count = 0;
			for (const [index, item] of over.entries()) {
				const run = await runItem(item, configuration, index);
				const touched = touchedCaseOf(run, onboardingDecisionKind);
				for (const decision of touched.decisions ?? []) {
					if (decision.level > (ONBOARDING_CEILINGS[decision.kind] ?? 5)) count += 1;
				}
			}
			return count;
		};
		expect(await breaches('bot-recommends', [...approve, ...hit])).toBe(0);
		expect(await breaches('bot-with-a-person-at-the-open', approve)).toBe(0);
		// Level 4: the bot decides on the match itself — over the hit-handling ceiling of 3.
		expect(await breaches('bot-with-a-person-at-the-open', hit)).toBeGreaterThan(0);
		expect(await breaches('bot-everywhere', approve)).toBe(approve.length);
		expect(await breaches('bot-everywhere', hit)).toBeGreaterThan(0);
	});

	it('the intake refuses a malformed work item with a finding', async () => {
		const malformed: WorkItem = {
			...sample[0]!,
			payload: { application: { productKind: 'current' } }
		};
		const run = await runItem(malformed, 'rules-only');
		expect(run.outcome).toBe('stopped');
		expect(run.stages).toHaveLength(1);
		expect(run.stages[0]).toMatchObject({ stageId: 'application', status: 'error' });
	});
});

describe('the reference configurations', () => {
	it('carry their autonomy level and the ceilings from the decision-rights table', () => {
		expect(ONBOARDING_CONFIGURATIONS['rules-only'].autonomy).toBeUndefined();
		expect(ONBOARDING_CONFIGURATIONS['bot-welcomes-only'].autonomy?.level).toBe(2);
		expect(ONBOARDING_CONFIGURATIONS['bot-recommends'].autonomy?.level).toBe(3);
		expect(ONBOARDING_CONFIGURATIONS['bot-with-a-person-at-the-open'].autonomy?.level).toBe(4);
		expect(ONBOARDING_CONFIGURATIONS['bot-everywhere'].autonomy).toEqual({
			level: 5,
			ceilings: ONBOARDING_CEILINGS
		});
		expect(ONBOARDING_CEILINGS).toEqual({
			'account-open': 4,
			'adverse-onboarding-decision': 3,
			'screening-hit-handling': 3
		});
		expect(onboardingWorkflow.configurations).toBe(ONBOARDING_CONFIGURATIONS);
		expect(fsOnboardingPack.workflows?.map((workflow) => workflow.id)).toEqual([
			'fs-onboarding/onboarding'
		]);
	});

	it('draws a book at a seed and size', () => {
		const drawn = onboardingWorkflow.book!({ seed: 1, size: 120 });
		expect(drawn.kind).toBe('onboarding');
		expect(drawn.source).toMatchObject({ seed: 1, size: 120 });
		expect(drawn.items).toHaveLength(10);
	});

	it('the journey is drawn: the identity stage fans to the screening and the decision, the record to the confirm and the end', () => {
		const layout = journeyLayout(onboardingWorkflow);
		expect(layout.nodes.map((node) => node.stageId).sort()).toEqual(
			[...onboardingWorkflow.stages.map((stage) => stage.id)].sort()
		);
		const from = (stageId: string) =>
			layout.edges.filter((edge) => edge.from === stageId).map((edge) => edge.to);
		expect(from('identity')).toEqual(expect.arrayContaining(['screening', 'decision']));
		expect(from('confirm')).toEqual(expect.arrayContaining(['open', { end: true }]));
		expect(layout.nodes.find((node) => node.stageId === 'open')?.irreversible).toBe(true);
		expect(layout.nodes.find((node) => node.stageId === 'confirm')?.lane).toBe('colleague');
		const recommends = journeyLayout(
			onboardingWorkflow,
			ONBOARDING_CONFIGURATIONS['bot-recommends']
		);
		expect(recommends.nodes.find((node) => node.stageId === 'decision')?.lane).toBe('colleague');
	});
});
