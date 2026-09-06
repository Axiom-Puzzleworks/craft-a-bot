import { parseScenarioDefinition } from '@craftabot/core';
import { isWorldInjection } from '@craftabot/core';
import { runScenario } from '@craftabot/evals';
import fsBankPack, { OBLIGATION_TAGS } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import fsLendingPack from '../index.js';
import { lendingDesk } from '../world/desk.js';
import { buildSpec } from '../testing/harness.js';
import { adversaryPlanFor, planFor } from '../testing/plans.js';
import { lendingGoalCards } from './goal-cards.js';
import { LENDING_DECKS, lendingScenarios, scenariosInLendingDeck } from './scenarios.js';

const THREAT_TAGS = new Set([
	'ASI01',
	'ASI02',
	'19/#25',
	'19/#38',
	'tool-poisoning',
	'confused-deputy'
]);

describe('the Lending Desk decks', () => {
	it('ships its scenarios on the manifest across four decks, each parsing, tagged from the vocabularies', () => {
		expect(fsLendingPack.scenarios).toBe(lendingScenarios);
		expect(lendingScenarios.length).toBeGreaterThanOrEqual(16);
		for (const deck of LENDING_DECKS)
			expect(scenariosInLendingDeck(deck).length).toBeGreaterThanOrEqual(
				deck === 'operational-incident' ? 1 : 2
			);
		const cards = new Set(lendingGoalCards.map((card) => card.id));
		const accepted = new Set(lendingDesk.spec.injections ?? []);
		for (const scenario of lendingScenarios) {
			expect(() => parseScenarioDefinition(scenario)).not.toThrow();
			expect(cards.has(scenario.goalCardId), scenario.id).toBe(true);
			for (const injection of scenario.injections.filter(isWorldInjection))
				expect(accepted.has(injection.kind)).toBe(true);
			for (const tag of scenario.tags)
				expect(tag in OBLIGATION_TAGS || THREAT_TAGS.has(tag), `${scenario.id}: ${tag}`).toBe(true);
		}
		expect(new Set(lendingScenarios.map((s) => s.id)).size).toBe(lendingScenarios.length);
	});

	it.each(lendingScenarios)(
		'$id: the safe plan reaches the outcome with the injection delivered',
		async (scenario) => {
			const run = await runScenario(scenario, {
				plan: 'safe',
				packs: [fsBankPack, fsLendingPack],
				spec: buildSpec({ goalCardId: scenario.goalCardId }),
				maxTicks: 12,
				stepLimit: 16,
				plans: { planFor, adversaryPlanFor }
			});
			expect(run.outcome).toBe('SUCCESS');
			const heard = scenario.injections.find((injection) => injection.kind === 'heard');
			if (heard) {
				const escaped = JSON.stringify(heard.text).slice(1, -1);
				expect(
					run.run.events.some(
						(event) =>
							event.type === 'world.changed' && JSON.stringify(event.payload).includes(escaped)
					),
					`${scenario.id} never heard its line`
				).toBe(true);
			}
		}
	);

	// Live once the evaluators ship (stage C): until then no scenario's expectations can be checked.
	const shipped = new Set((fsLendingPack.evaluators ?? []).map((evaluator) => evaluator.id));
	it.each(
		lendingScenarios.filter(
			(scenario) =>
				scenario.expect.evaluators.length > 0 &&
				scenario.expect.evaluators.every((check) => shipped.has(check.evaluatorId))
		)
	)(
		'$id: the safe plan earns every listed verdict and the unsafe plan flips each (stage C)',
		async (scenario) => {
			for (const plan of ['safe', 'unsafe'] as const) {
				const run = await runScenario(scenario, {
					plan,
					packs: [fsBankPack, fsLendingPack],
					spec: buildSpec({ goalCardId: scenario.goalCardId }),
					maxTicks: 12,
					stepLimit: 16,
					plans: { planFor, adversaryPlanFor }
				});
				for (const check of run.checks)
					expect(
						check.met,
						`${scenario.id} ${plan} ${check.evaluatorId}: expected ${check.expected}, got ${check.actual}`
					).toBe(true);
			}
		}
	);
});
