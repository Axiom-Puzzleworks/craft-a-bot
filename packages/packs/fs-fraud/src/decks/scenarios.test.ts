import { parseScenarioDefinition } from '@craftabot/core';
import { runScenario } from '@craftabot/evals';
import fsBankPack, { OBLIGATION_TAGS } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import fsFraudPack from '../index.js';
import { fraudDesk } from '../world/desk.js';
import { buildSpec } from '../testing/harness.js';
import { adversaryPlanFor, planFor } from '../testing/plans.js';
import { fraudGoalCards } from './goal-cards.js';
import { FRAUD_DECKS, fraudScenarios, scenariosInFraudDeck } from './scenarios.js';

const THREAT_TAGS = new Set([
	'ASI01',
	'ASI02',
	'ASI07',
	'19/#12',
	'19/#25',
	'19/#38',
	'indirect-injection',
	'tool-poisoning',
	'confused-deputy',
	'social-engineering',
	'app-scam'
]);

describe('the Fraud Desk decks', () => {
	it('ships its scenarios on the manifest across four decks, each parsing, tagged from the vocabularies', () => {
		expect(fsFraudPack.scenarios).toBe(fraudScenarios);
		expect(fraudScenarios.length).toBeGreaterThanOrEqual(17);
		for (const deck of FRAUD_DECKS)
			expect(scenariosInFraudDeck(deck).length).toBeGreaterThanOrEqual(2);
		const cards = new Set(fraudGoalCards.map((card) => card.id));
		const accepted = new Set(fraudDesk.spec.injections ?? []);
		for (const scenario of fraudScenarios) {
			expect(() => parseScenarioDefinition(scenario)).not.toThrow();
			expect(cards.has(scenario.goalCardId), scenario.id).toBe(true);
			for (const injection of scenario.injections) expect(accepted.has(injection.kind)).toBe(true);
			for (const tag of scenario.tags)
				expect(tag in OBLIGATION_TAGS || THREAT_TAGS.has(tag), `${scenario.id}: ${tag}`).toBe(true);
		}
		expect(new Set(fraudScenarios.map((s) => s.id)).size).toBe(fraudScenarios.length);
	});

	it.each(fraudScenarios)(
		'$id: the safe plan reaches the outcome with the injection delivered',
		async (scenario) => {
			const run = await runScenario(scenario, {
				plan: 'safe',
				packs: [fsBankPack, fsFraudPack],
				spec: buildSpec({ goalCardId: scenario.goalCardId }),
				maxTicks: 14,
				stepLimit: 18,
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

	it.each(fraudScenarios.filter((scenario) => scenario.expect.evaluators.length > 0))(
		'$id: the safe plan earns every listed verdict and the unsafe plan flips each (stage C)',
		async (scenario) => {
			for (const plan of ['safe', 'unsafe'] as const) {
				const run = await runScenario(scenario, {
					plan,
					packs: [fsBankPack, fsFraudPack],
					spec: buildSpec({ goalCardId: scenario.goalCardId }),
					maxTicks: 14,
					stepLimit: 18,
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
