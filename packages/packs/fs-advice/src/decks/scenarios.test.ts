import { parseScenarioDefinition } from '@craftabot/core';
import { runScenario } from '@craftabot/evals';
import fsBankPack, { OBLIGATION_TAGS } from '@craftabot/pack-fs-bank';
import { describe, expect, it } from 'vitest';
import fsAdvicePack from '../index.js';
import { adviceDesk } from '../world/desk.js';
import { buildSpec } from '../testing/harness.js';
import { adversaryPlanFor, planFor } from '../testing/plans.js';
import { adviceGoalCards } from './goal-cards.js';
import { ADVICE_DECKS, adviceScenarios, scenariosInDeck } from './scenarios.js';

/**
 * The four decks (WP60 stage B): thirty scenarios that parse, name cards the
 * pack ships, carry only injections the desk takes, are tagged from the
 * obligation vocabulary or the threat vocabulary, and — the point — every
 * safe plan reaches the card's outcome through the scenario runner with the
 * injection delivered.
 */
const THREAT_TAGS = new Set([
	'ASI01',
	'ASI02',
	'ASI07',
	'19/#11',
	'19/#12',
	'19/#25',
	'19/#38',
	'prompt-injection',
	'tool-poisoning',
	'confused-deputy',
	'social-engineering',
	'exfiltration',
	'advice-boundary',
	'irreversible-action'
]);

describe('the Advice Desk decks', () => {
	it('ships thirty scenarios on the manifest, across four decks, each parsing', () => {
		// The manifest carries the complaints deck beside them since WP72 (`61-…` §4.2).
		expect(fsAdvicePack.scenarios?.slice(0, adviceScenarios.length)).toEqual(adviceScenarios);
		expect(fsAdvicePack.scenarios).toHaveLength(37);
		expect(adviceScenarios).toHaveLength(30);
		for (const deck of ADVICE_DECKS) expect(scenariosInDeck(deck).length).toBeGreaterThanOrEqual(5);
		for (const scenario of adviceScenarios) {
			expect(() => parseScenarioDefinition(scenario)).not.toThrow();
			expect(scenario.id.startsWith('fs-advice/scenarios/')).toBe(true);
		}
		expect(new Set(adviceScenarios.map((s) => s.id)).size).toBe(30);
	});

	it('names only cards the pack ships, carries only injections the desk takes, and tags from the vocabularies', () => {
		const cards = new Set(adviceGoalCards.map((card) => card.id));
		const accepted = new Set(adviceDesk.spec.injections ?? []);
		for (const scenario of adviceScenarios) {
			expect(cards.has(scenario.goalCardId), scenario.id).toBe(true);
			for (const injection of scenario.injections) expect(accepted.has(injection.kind)).toBe(true);
			expect(scenario.tags.length).toBeGreaterThan(0);
			for (const tag of scenario.tags)
				expect(tag in OBLIGATION_TAGS || THREAT_TAGS.has(tag), `${scenario.id}: ${tag}`).toBe(true);
			expect(planFor(scenario.goalCardId)).toBeDefined();
			expect(adversaryPlanFor(scenario.goalCardId)).toBeDefined();
		}
	});

	it.each(adviceScenarios)(
		'$id: the safe plan reaches the outcome with the injection delivered',
		async (scenario) => {
			const run = await runScenario(scenario, {
				plan: 'safe',
				packs: [fsBankPack, fsAdvicePack],
				spec: buildSpec({ goalCardId: scenario.goalCardId }),
				stepLimit: 16,
				plans: { planFor, adversaryPlanFor }
			});
			expect(run.outcome).toBe('SUCCESS');
			expect(run.outcomeMet).toBe(true);
			const heard = scenario.injections.find((injection) => injection.kind === 'heard');
			if (heard) {
				// The line as JSON escapes it, since the payload is compared as JSON.
				const escaped = JSON.stringify(heard.text).slice(1, -1);
				const said = run.run.events.some(
					(event) =>
						event.type === 'world.changed' && JSON.stringify(event.payload).includes(escaped)
				);
				expect(said, `${scenario.id} never heard its line`).toBe(true);
			}
		}
	);

	it.each(adviceScenarios.filter((scenario) => scenario.expect.evaluators.length > 0))(
		'$id: the safe plan earns every listed verdict and the unsafe plan flips each (stage C)',
		async (scenario) => {
			for (const plan of ['safe', 'unsafe'] as const) {
				const run = await runScenario(scenario, {
					plan,
					packs: [fsBankPack, fsAdvicePack],
					spec: buildSpec({ goalCardId: scenario.goalCardId }),
					// A tick budget, so an unsafe run that never wins still finishes and writes its truth.
					maxTicks: 10,
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
