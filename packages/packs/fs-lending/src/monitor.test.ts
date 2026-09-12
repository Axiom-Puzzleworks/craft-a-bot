import { localPackFrom, type AnyAgentSpec, type Guardrail } from '@craftabot/core';
import { createMockProvider } from '@craftabot/core/testing';
import {
	cohortOf,
	decisionOf,
	foldMonitor,
	parseCampaign,
	referenceFromItems,
	runCampaign,
	scriptedOptimal,
	specFor,
	type MonitorRun
} from '@craftabot/evals';
import { compilePolicyCard } from '@craftabot/governance';
import {
	fairnessMetric,
	touchesPerCase,
	unattendedRate,
	wilson,
	type DecidedCase
} from '@craftabot/metrics';
import fsBankPack, { bankClock, population } from '@craftabot/pack-fs-bank';
import starterPack from '@craftabot/pack-starter';
import { memorySink, runBank } from '@craftabot/workflow';
import { describe, expect, it } from 'vitest';
import { lendingBookCampaign } from './campaign.js';
import fsLendingPack, { LENDING_WORKFLOW_ID, lendingWorkflow } from './index.js';
import { adversaryPlanFor, planFor } from './testing/plans.js';

/**
 * **The Monitor's fold equals the report's** (WP84, `75-THE-MONITOR.md`
 * §7; `65-…` WP84's DoD): the loan book of a small population worked two
 * ways — as a book campaign through `runCampaign`, one cell per item, and
 * as a bank day through `runBank` into a memory sink, one workflow run per
 * item — then the Monitor's readouts over the runs held against the
 * report's fold over the cells: per item the same decision, touches and
 * breaches; over the book the same approval band, touches per case,
 * unattended rate, breach rate and fairness rows. One configuration with a
 * person at the decision, so touches, decisions and ceilings all appear.
 */
const CONFIGURATION = 'bot-with-a-person-at-the-decision';
const SEED = 1;
const SIZE = 700;
const packs = [fsBankPack, fsLendingPack];
const plans = { planFor, adversaryPlanFor };

describe('the Monitor over the lending desk', { timeout: 300_000 }, () => {
	it('folds the same numbers the campaign report folds over the same items', async () => {
		const campaign = parseCampaign(
			lendingBookCampaign({ seed: SEED, size: SIZE, configurations: [CONFIGURATION] })
		);
		const report = await runCampaign(campaign, {
			packs,
			plans,
			now: () => '2026-09-11T09:00:00.000Z',
			newId: () => 'report-1'
		});
		const cells = report.cells.filter((cell) => cell.item !== undefined);
		expect(cells.length).toBeGreaterThan(20);

		// The same book, as a bank day over the population's whole period.
		const pop = population(SEED, { size: SIZE });
		const book = lendingWorkflow.book!({ seed: SEED, size: SIZE });
		const from = pop.transactions.dateOf(0);
		const to = pop.transactions.dateOf(pop.options.periodDays - 1);
		const registry = {
			getPolicyCard: (id: string) =>
				[...(fsBankPack.policyCards ?? []), ...(fsLendingPack.policyCards ?? [])].find(
					(card) => card.id === id
				)
		};
		const desk = {
			id: 'lending',
			workflowId: LENDING_WORKFLOW_ID,
			kinds: ['application' as const],
			configuration: CONFIGURATION,
			concurrency: 4,
			build: CONFIGURATION
		};
		const spec: AnyAgentSpec = specFor({
			scenario: {
				id: 'lending',
				goalCardId: LENDING_WORKFLOW_ID,
				tags: [],
				injections: [],
				fit: []
			},
			build: campaign.builds[0]!,
			guard: { id: 'none', fit: [] }
		});
		const sink = memorySink();
		const arrivals: MonitorRun[] = [];
		const record = await runBank(
			bankClock({ population: pop, from, to, books: [book], acceleration: Infinity, seed: SEED }),
			[desk],
			sink,
			{
				packs: [starterPack, ...packs, localPackFrom([])],
				workflows: [lendingWorkflow],
				specFor: () => spec,
				providerFor: (_desk, _stage, goalCardId) =>
					createMockProvider({
						script: scriptedOptimal(planFor(goalCardId)),
						id: 'scripted-optimal'
					}),
				guardrailsFor: (ids) =>
					ids.flatMap((id): Guardrail[] => {
						const card = registry.getPolicyCard(id);
						return card ? compilePolicyCard(card) : [];
					}),
				seed: SEED,
				clock: {
					from,
					to,
					seed: SEED,
					acceleration: 'Infinity',
					books: [{ kind: 'application', items: book.items.length }]
				},
				populationDigest: pop.digest,
				newId: () => 'bank-1'
			}
		);
		expect(record.counts.routed).toBe(book.items.length);
		const runs: MonitorRun[] = sink.workflowRuns.map((entry) => ({
			...entry,
			agentEvents: sink.agentRuns
				.filter((agentRun) => entry.run.runIds.includes(agentRun.runId))
				.flatMap((agentRun) => agentRun.events)
		}));
		expect(runs).toHaveLength(cells.length);
		void arrivals;

		// Per item: the decision, the touches and the breaches agree between the two roads.
		const byItem = new Map(cells.map((cell) => [cell.item!.id, cell]));
		const state = foldMonitor(runs, {
			from,
			to,
			window: runs.length,
			minimum: 1,
			decisionKindOf: () => lendingWorkflow.decisionKindOf,
			reference: referenceFromItems(book.items)
		});
		let decidedInCells = 0;
		let approvedInCells = 0;
		let referredInCells = 0;
		let breachesInCells = 0;
		let ceilingDecisionsInCells = 0;
		const touched = [];
		const cases: DecidedCase[] = [];
		for (const entry of runs) {
			const cell = byItem.get(entry.item.id)!;
			expect(cell).toBeDefined();
			const decision = decisionOf([...entry.agentEvents, ...entry.run.events], entry.item.truth);
			expect(decision?.outcome).toBe(cell.decision?.outcome);
			if (cell.decision) {
				decidedInCells += 1;
				if (cell.decision.outcome === 'approve') approvedInCells += 1;
				if (cell.decision.outcome === 'refer') referredInCells += 1;
				const group = cell.cohort?.['ageBand'];
				if (group !== undefined)
					cases.push({
						group,
						decision: cell.decision.outcome,
						verdict: cell.decision.verdict,
						repaid: cell.decision.repaid
					});
			}
			expect(entry.run.stages.map((stage) => `${stage.stageId}:${stage.status}`)).toEqual(
				cell.workflow!.stages.map((stage) => `${stage.stageId}:${stage.status}`)
			);
			breachesInCells += cell.workflow!.breaches;
			ceilingDecisionsInCells += cell.workflow!.decisions.length;
			touched.push({
				id: cell.workflow!.runId,
				touches: cell.workflow!.touches.map((kind) => ({ kind }))
			});
		}
		// Over the book: the report's own functions over the cells give the Monitor's readouts.
		expect(state.readouts.decided).toBe(decidedInCells);
		expect(state.readouts.decisions.approve).toBe(approvedInCells);
		expect(state.readouts.approvalRate.value).toBe(approvedInCells / decidedInCells);
		expect(state.readouts.approvalRate.interval).toEqual([
			...wilson(approvedInCells, decidedInCells)
		]);
		expect(state.readouts.referralRate.value).toBe(referredInCells / decidedInCells);
		expect(state.readouts.touchesPerCase.value).toBe(touchesPerCase(touched).value);
		expect(state.readouts.touchesPerCase.byKind).toEqual(touchesPerCase(touched).detail ?? {});
		expect(state.readouts.unattendedRate.value).toBe(unattendedRate(touched).value);
		expect(state.readouts.breaches).toBe(breachesInCells);
		expect(state.readouts.ceilingDecisions).toBe(ceilingDecisionsInCells);
		const load = report.summary!.humanLoad.find((row) => row.build === CONFIGURATION)!;
		expect(state.readouts.touchesPerCase.value).toBe(load.touchesPerCase);
		expect(state.readouts.unattendedRate.value).toBe(load.unattendedRate);
		expect(state.readouts.ceilingBreachRate.value).toBe(load.ceilingBreachRate);
		expect(state.readouts.touchesPerCase.value).toBeGreaterThan(0);
		// Fairness now: the parity gate's metric over the same DecidedCases.
		for (const row of state.fairness) {
			const expected = fairnessMetric(row.metric as 'demographic-parity', cases);
			expect(row.value).toBe(expected.value);
			expect(row.interval).toEqual([...expected.interval]);
			expect(row.n).toBe(cases.length);
		}
		expect(state.fairness.length).toBe(3);
		expect(state.drift[0]?.psi).toBeDefined();
		expect(cohortOf(runs[0]!.item.truth)?.['ageBand']).toBeDefined();
		// A person confirmed some approvals: one touch on those, so the mean sits between 0 and 1.
		expect(state.readouts.touchesPerCase.value).toBeLessThanOrEqual(1);
	});
});
