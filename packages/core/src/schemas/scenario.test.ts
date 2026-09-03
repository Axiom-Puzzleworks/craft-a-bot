import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import type { PackManifest } from './pack-manifest.js';
import {
	injectionSchema,
	parseScenarioDefinition,
	safeParseScenarioDefinition,
	scenarioPackFileSchema
} from './scenario.js';

const minimal = {
	id: 'p/scenarios/one',
	title: 'One',
	goalCardId: 'p/card',
	schemaVersion: 1
};

describe('scenarioDefinitionSchema (WP44)', () => {
	it('fills the defaults: no tags, no injections, no expectations, no plans', () => {
		const scenario = parseScenarioDefinition(minimal);
		expect(scenario.tags).toEqual([]);
		expect(scenario.injections).toEqual([]);
		expect(scenario.expect).toEqual({ evaluators: [] });
		expect(scenario.plans).toEqual({});
	});

	it('accepts every injection kind', () => {
		const injections = [
			{ kind: 'heard', text: 'psst', atTick: 3 },
			{ kind: 'manual-entry', key: 'poem', text: 'Roses are red.' },
			{ kind: 'tool-result', toolId: 'p/tool', result: { ok: true } },
			{ kind: 'radio', fromName: 'Bolt', channel: 'work', text: 'hello' }
		];
		for (const injection of injections)
			expect(injectionSchema.safeParse(injection).success).toBe(true);
		expect(injectionSchema.safeParse({ kind: 'telepathy', text: 'x' }).success).toBe(false);
		expect(injectionSchema.safeParse({ kind: 'heard', text: '' }).success).toBe(false);
	});

	it('refuses an unknown schema version and a bad verdict', () => {
		expect(safeParseScenarioDefinition({ ...minimal, schemaVersion: 2 }).success).toBe(false);
		expect(
			safeParseScenarioDefinition({
				...minimal,
				expect: { evaluators: [{ evaluatorId: 'e', verdict: 'maybe' }] }
			}).success
		).toBe(false);
	});

	it('a scenario pack file is a named list of scenarios', () => {
		const file = scenarioPackFileSchema.parse({
			format: 'craftabot-scenarios',
			formatVersion: 1,
			id: 'corpus',
			name: 'A corpus',
			scenarios: [minimal]
		});
		expect(file.scenarios[0]?.tags).toEqual([]);
	});
});

describe('the registry (WP44)', () => {
	const pack = (scenarios: PackManifest['scenarios']): PackManifest => ({
		id: 'p',
		name: 'P',
		version: '0.0.1',
		requiresCore: '>=0.0.1',
		...(scenarios ? { scenarios } : {})
	});

	it('lists and finds a pack’s scenarios by id', () => {
		const registry = createPackRegistry();
		registry.registerPack(pack([parseScenarioDefinition(minimal)]));
		expect(registry.getScenario('p/scenarios/one')?.title).toBe('One');
		expect(registry.getScenario('p/scenarios/two')).toBeUndefined();
		expect(registry.listScenarios().map((scenario) => scenario.id)).toEqual(['p/scenarios/one']);
	});

	it('refuses two scenarios with the same id', () => {
		const registry = createPackRegistry();
		registry.registerPack(pack([parseScenarioDefinition(minimal)]));
		expect(() =>
			registry.registerPack({ ...pack([parseScenarioDefinition(minimal)]), id: 'q' })
		).toThrow(/scenario/);
	});
});
