import { describe, expect, it } from 'vitest';
import type { GuardrailComponent, Stack } from '@craftabot/core';
import { parseCampaign } from '@craftabot/evals';
import { compileStackLoop, stackBoundaryFits } from '@craftabot/governance';
import { createRegistry } from '$lib/packs.js';
import {
	configure,
	connectionLamp,
	emptyStack,
	filterComponents,
	fitAt,
	groupByTechnique,
	renamed,
	stackRecord,
	stackTestCampaign,
	unfit
} from './studio.js';

/**
 * WP101 (`88-STUDIO.md` §8): a drag and a keyboard fit produce the same
 * stack — both are `fitAt`; a fit at a point the component does not decide
 * at is refused; a saved stack reloads and compiles identically; the test
 * bench's campaign carries the loop fits as the guard's components; the
 * catalogue's filters and lamps.
 */
const registry = createRegistry();
const AUTHOR = { kind: 'person' as const, id: 'sam' };
const NOW = '2026-09-12T00:00:00.000Z';
const componentById = (id: string): GuardrailComponent => {
	const component = registry.getGuardrailComponent(id);
	if (!component) throw new Error(`no component ${id}`);
	return component;
};

describe('fitAt', () => {
	it('places a fit at a point, once, and refuses a point the component does not decide at', () => {
		const budget = componentById('governance/step-budget');
		const point = { kind: budget.points[0]! };
		const dragged = fitAt(emptyStack(AUTHOR, NOW), budget, point);
		const keyed = fitAt(emptyStack(AUTHOR, NOW), budget, point);
		expect(dragged).toEqual(keyed);
		if (!dragged.ok) throw new Error(dragged.reason);
		expect(dragged.stack.fit).toEqual([{ componentId: budget.id, point }]);
		// The same fit again is the same stack.
		expect(fitAt(dragged.stack, budget, point)).toEqual({ ok: true, stack: dragged.stack });
		const off = (['pre-think', 'pre-act', 'post-act', 'stage-in', 'egress'] as const).find(
			(kind) => !budget.points.includes(kind)
		)!;
		const refused = fitAt(dragged.stack, budget, { kind: off });
		expect(refused.ok).toBe(false);
		if (!refused.ok) expect(refused.reason).toContain(budget.name);
	});

	it('unfits, configures and renames', () => {
		const budget = componentById('governance/step-budget');
		const fitted = fitAt(emptyStack(AUTHOR, NOW), budget, { kind: budget.points[0]! });
		if (!fitted.ok) throw new Error(fitted.reason);
		const configured = configure(fitted.stack, 0, { maxTicks: 3 });
		expect(configured.fit[0]?.config).toEqual({ maxTicks: 3 });
		expect(unfit(configured, 0).fit).toEqual([]);
		const named = renamed(configured, 'My Guard Stack!');
		expect(named.id).toBe('local/stacks/my-guard-stack');
		expect(named.name).toBe('My Guard Stack!');
	});
});

describe('the saved stack', () => {
	it('reloads from its content record and compiles identically', () => {
		// The local classifier's config parses empty (its offline stand-in); a built-in's needs its numbers.
		const budget = componentById('guard-local/llama-guard');
		const fitted = fitAt(emptyStack(AUTHOR, NOW, 'Guarded'), budget, { kind: 'pre-act' }, {});
		if (!fitted.ok) throw new Error(fitted.reason);
		const record = stackRecord(fitted.stack, NOW);
		const reloaded = JSON.parse(JSON.stringify(record.record)) as Stack;
		expect(reloaded).toEqual(fitted.stack);
		const before = compileStackLoop(fitted.stack, registry).map((guardrail) => guardrail.id);
		const after = compileStackLoop(reloaded, registry).map((guardrail) => guardrail.id);
		expect(after).toEqual(before);
		expect(before.length).toBeGreaterThan(0);
	});
});

describe('the test bench campaign', () => {
	it('carries each stack as a guard with its loop fits as components', () => {
		const budget = componentById('governance/step-budget');
		const fitted = fitAt(emptyStack(AUTHOR, NOW, 'A'), budget, { kind: budget.points[0]! });
		if (!fitted.ok) throw new Error(fitted.reason);
		const withBoundary: Stack = {
			...fitted.stack,
			fit: [...fitted.stack.fit, { componentId: budget.id, point: { kind: 'stage-in' } }]
		};
		const campaign = stackTestCampaign({
			scenarioId: 'warning-sign',
			brain: 'scripted-optimal',
			seed: 3,
			stacks: [withBoundary]
		}) as { guards: Array<{ id: string; components: Array<{ id: string }> }>; seeds: number[] };
		expect(campaign.guards).toHaveLength(1);
		expect(campaign.guards[0]?.id).toBe(withBoundary.id);
		expect(campaign.guards[0]?.components).toEqual([
			{ id: budget.id, point: { kind: budget.points[0] } }
		]);
		expect(campaign.seeds).toEqual([3]);
		expect(parseCampaign(campaign)).toBeTruthy();
	});
});

describe('the catalogue', () => {
	const components = registry.listGuardrailComponents();

	it('filters by point, verdict, cost and connection, and groups by technique', () => {
		expect(components.length).toBeGreaterThan(5);
		for (const component of filterComponents(components, { point: 'pre-act' }))
			expect(component.points).toContain('pre-act');
		for (const component of filterComponents(components, { connection: 'hosted' }))
			expect(component.connection?.kind).toBe('hosted');
		for (const component of filterComponents(components, { connection: 'none' }))
			expect(component.connection).toBeUndefined();
		const groups = groupByTechnique(components);
		expect(groups.flatMap((group) => group.components)).toHaveLength(components.length);
		expect(groups.map((group) => group.technique)).toEqual(
			[...new Set(components.map((component) => component.technique))].sort()
		);
	});

	it('lamps a built-in, a local classifier, a hosted service with and without its battery', () => {
		const builtIn = componentById('governance/step-budget');
		expect(connectionLamp(builtIn, registry, () => false).word).toBe('built in');
		// The local classifiers declare `browserCapable: false` (Ollama is the harness's to call live): harness only, whatever the vault holds.
		const local = componentById('guard-local/llama-guard');
		expect(connectionLamp(local, registry, () => true).word).toBe('harness only');
		const opa = componentById('pdp-opa/opa');
		expect(['connected', 'stand-in']).toContain(connectionLamp(opa, registry, () => true).word);
		const armour = componentById('geap/model-armor');
		expect(connectionLamp(armour, registry, () => false).word).toBe('needs a battery');
		expect(connectionLamp(armour, registry, () => true).word).toBe('connected');
		const azure = componentById('azure-content-safety/content-safety');
		expect(connectionLamp(azure, registry, () => true).word).toBe('harness only');
	});
});

describe('the design’s stack, built fit by fit (`83-…` §14 item 2, the Studio half)', () => {
	it('a hosted service on its stand-in, a bespoke card and a breaker at stage-out save, reload and compile to the same chains', () => {
		const fits: Array<
			[string, { kind: 'pre-think' | 'pre-act' | 'stage-out'; at?: string }, unknown]
		> = [
			['governance/step-budget', { kind: 'pre-think' }, { maxTicks: 12 }],
			[
				'governance/policy-card',
				{ kind: 'pre-act' },
				{ cardId: 'fs-lending/policy/no-decision-before-affordability' }
			],
			[
				'geap/model-armor',
				{ kind: 'pre-act' },
				{
					serviceConfig: {
						projectId: 'proj-1',
						location: 'europe-west2',
						templateId: 'cab-armour'
					},
					screening: {
						offline: true,
						screenObservation: 'note',
						screenDecision: 'block',
						screenResult: 'note'
					}
				}
			],
			[
				'monitor/evaluator-breaker',
				{ kind: 'stage-out', at: 'decision' },
				{ evaluatorId: 'fs-lending/decision-matches-rules', onFail: true }
			]
		];
		let built = emptyStack(AUTHOR, NOW, 'Three ways');
		for (const [id, point, config] of fits) {
			const result = fitAt(built, componentById(id), point, config);
			if (!result.ok) throw new Error(result.reason);
			built = result.stack;
		}
		expect(built.fit).toHaveLength(4);
		const reloaded = JSON.parse(JSON.stringify(stackRecord(built, NOW).record)) as Stack;
		const ids = (chain: readonly { id: string; componentId?: string }[]) =>
			chain.map((guardrail) => `${guardrail.componentId ?? '-'}:${guardrail.id}`);
		expect(ids(compileStackLoop(reloaded, registry))).toEqual(
			ids(compileStackLoop(built, registry))
		);
		// Three loop fits; Model Armor's adapter compiles to its floor and its service, so the chain is longer than the fits.
		expect(compileStackLoop(built, registry).length).toBeGreaterThanOrEqual(3);
		expect(stackBoundaryFits(reloaded, 'decision')).toEqual(stackBoundaryFits(built, 'decision'));
		expect(stackBoundaryFits(built, 'decision')).toHaveLength(1);
		// The bench carries the three loop fits; the breaker at the boundary is the journey's to run.
		const campaign = stackTestCampaign({
			scenarioId: 'warning-sign',
			brain: 'scripted-optimal',
			seed: 1,
			stacks: [built]
		}) as {
			guards: Array<{ components: Array<{ id: string }> }>;
		};
		expect(campaign.guards[0]?.components.map((fit) => fit.id)).toEqual([
			'governance/step-budget',
			'governance/policy-card',
			'geap/model-armor'
		]);
	});
});
