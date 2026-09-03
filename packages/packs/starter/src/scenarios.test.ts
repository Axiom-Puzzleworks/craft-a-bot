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

	it('carries no injections of its own — the content stays in the layouts and the manual', () => {
		for (const scenario of starterScenarios) expect(scenario.injections).toEqual([]);
	});
});
