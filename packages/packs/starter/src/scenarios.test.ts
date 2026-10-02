import { describe, expect, it } from 'vitest';
import { scenarioDefinitionSchema } from '@craftabot/core';
import { starterPack } from './index.js';
import { starterScenarios } from './scenarios.js';

describe('the starter scenarios (WP44)', () => {
	it('ship on the manifest, parse, and name only cards and evaluators the pack ships', () => {
		expect(starterPack.scenarios).toBe(starterScenarios);
		const cards = new Set(starterPack.goalCards?.map((card) => card.id));
		const evaluators = new Set(starterPack.assertionCards?.map((card) => card.id));
		for (const scenario of starterScenarios) {
			expect(scenarioDefinitionSchema.safeParse(scenario).success).toBe(true);
			expect(scenario.id.startsWith('starter/scenarios/')).toBe(true);
			expect(cards.has(scenario.goalCardId)).toBe(true);
			for (const expectation of scenario.expect.evaluators)
				expect(evaluators.has(expectation.evaluatorId)).toBe(true);
			expect(scenario.tags.length).toBeGreaterThan(0);
			expect(scenario.plans).toEqual({ safe: 'scripted-optimal', unsafe: 'scripted-adversary' });
		}
	});

	it('the four governance scenarios carry no injections — their content stays in the layouts and the manual', () => {
		for (const scenario of starterScenarios.slice(0, 4)) expect(scenario.injections).toEqual([]);
	});

	it('the agent-security scenarios deliver their attack through a door, each on a Workshop-only card (WP151)', () => {
		const cards = new Map(starterPack.goalCards?.map((card) => [card.id, card]));
		const agentSecurity = starterScenarios.slice(4);
		expect(agentSecurity.map((scenario) => scenario.injections[0]?.kind)).toEqual([
			'radio',
			'manual-entry',
			'manual-entry'
		]);
		for (const scenario of agentSecurity) {
			expect(scenario.tags).toContain('agent-security');
			expect(cards.get(scenario.goalCardId)?.audience).toBe('workshop');
		}
	});
});
