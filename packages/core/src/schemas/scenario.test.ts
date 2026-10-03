import { describe, expect, it } from 'vitest';
import { createPackRegistry } from '../pack-registry.js';
import type { PackManifest } from './pack-manifest.js';
import {
	expandScenarioTemplate,
	injectionSchema,
	parseScenarioDefinition,
	safeParseScenarioDefinition,
	scenarioPackFileSchema,
	scenarioTemplateSchema
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

describe('scenario templates (WP175)', () => {
	const template = scenarioTemplateSchema.parse({
		...minimal,
		id: 'p/templates/pressure',
		tags: ['t'],
		injections: [{ kind: 'heard', text: 'Hello.' }],
		draws: [
			{
				kind: 'one-of',
				name: 'persona',
				options: [
					{
						id: 'pushy',
						weight: 3,
						tags: ['asks-to-skip'],
						injections: [{ kind: 'counterpart', scriptId: 'pushy' }]
					},
					{
						id: 'vulnerable',
						weight: 1,
						injections: [{ kind: 'counterpart', scriptId: 'vulnerable' }]
					}
				]
			},
			{ kind: 'tick-in', name: 'when', min: 2, max: 6, applyTo: ['heard', 'provider-fault'] }
		]
	});

	it('is deterministic in the template and the seed, and the id names both', () => {
		expect(expandScenarioTemplate(template, 4)).toEqual(expandScenarioTemplate(template, 4));
		expect(expandScenarioTemplate(template, 4).id).toBe('p/templates/pressure#4');
		expect(expandScenarioTemplate(template, 4)).not.toHaveProperty('draws');
	});

	it('draws one option per seed at its weight, carries its tags and injections, and says what it chose', () => {
		let pushy = 0;
		const seen = new Set<number>();
		for (let seed = 1; seed <= 2000; seed += 1) {
			const scenario = expandScenarioTemplate(template, seed);
			const chosen = scenario.tags.find((tag) => tag.startsWith('draw:persona='));
			if (chosen === 'draw:persona=pushy') {
				pushy += 1;
				expect(scenario.tags).toContain('asks-to-skip');
				expect(scenario.injections).toContainEqual({ kind: 'counterpart', scriptId: 'pushy' });
			} else
				expect(scenario.injections).toContainEqual({ kind: 'counterpart', scriptId: 'vulnerable' });
			expect(scenario.tags).toContain('t');
			seen.add(Number(scenario.tags.find((tag) => tag.startsWith('draw:when='))?.split('=')[1]));
		}
		// Three to one, within a few points; every tick in [2, 6] reached, none outside.
		expect(pushy / 2000).toBeGreaterThan(0.71);
		expect(pushy / 2000).toBeLessThan(0.79);
		expect([...seen].sort()).toEqual([2, 3, 4, 5, 6]);
	});

	it('sets the drawn tick on the template’s heard injection and on no other kind', () => {
		const scenario = expandScenarioTemplate(template, 9);
		const tick = Number(scenario.tags.find((tag) => tag.startsWith('draw:when='))?.split('=')[1]);
		expect(scenario.injections[0]).toEqual({ kind: 'heard', text: 'Hello.', atTick: tick });
		expect(scenario.injections.at(-1)).toMatchObject({ kind: 'counterpart' });
		expect(scenario.injections.at(-1)).not.toHaveProperty('atTick');
	});

	it('a draw has its own stream: adding one does not change what an earlier one chose', () => {
		const more = scenarioTemplateSchema.parse({
			...template,
			draws: [
				...template.draws,
				{ kind: 'one-of', name: 'extra', options: [{ id: 'a' }, { id: 'b' }] }
			]
		});
		for (let seed = 1; seed <= 50; seed += 1) {
			const a = expandScenarioTemplate(template, seed);
			const b = expandScenarioTemplate(more, seed);
			expect(b.tags.filter((tag) => !tag.startsWith('draw:extra='))).toEqual(a.tags);
		}
	});

	it('a template with no draws is its scenario at any seed, and a bad one is refused', () => {
		const plain = scenarioTemplateSchema.parse(minimal);
		expect(expandScenarioTemplate(plain, 1)).toMatchObject({ goalCardId: 'p/card', title: 'One' });
		expect(
			scenarioTemplateSchema.safeParse({
				...minimal,
				draws: [{ kind: 'tick-in', name: 'x', min: 5, max: 2, applyTo: ['heard'] }]
			}).success
		).toBe(false);
		expect(
			scenarioTemplateSchema.safeParse({
				...minimal,
				draws: [
					{ kind: 'one-of', name: 'x', options: [{ id: 'a' }] },
					{ kind: 'one-of', name: 'x', options: [{ id: 'b' }] }
				]
			}).success
		).toBe(false);
	});
});
