import { describe, expect, it } from 'vitest';
import { createPackRegistry, type PackManifest, type Stack } from '@craftabot/core';
import starterPack from '@craftabot/pack-starter';
import {
	componentChainFor,
	groupStackFor,
	resolveGuardStack,
	type CampaignGuard
} from './campaign.js';
import { campaignFor, experimentSchema } from './experiment.js';
import { injectionBaseline } from './baseline-campaign.js';

/**
 * **A guard by stack** (WP97, `89-STACKS.md` §4): resolved once into the
 * component form — the stack's loop and egress fits after the guard's own,
 * its chokepoint half unless the guard names one — and refused when no pack
 * ships it; an experiment's `guard` level naming no template guard is a
 * stack by that id.
 */
const STACK: Stack = {
	schemaVersion: 1,
	id: 'test/stack/budget',
	name: 'A budget',
	description: 'A step budget and a blocklist, with a breaker at the chokepoint.',
	fit: [
		{
			componentId: 'governance/step-budget',
			config: { maxTicks: 5 },
			point: { kind: 'pre-think' }
		},
		{
			componentId: 'governance/action-blocklist',
			config: { blockedActions: ['move'] },
			point: { kind: 'pre-act' }
		},
		{ componentId: 'governance/egress-none', point: { kind: 'egress' } },
		{
			componentId: 'governance/policy-card',
			config: { cardId: 'starter/policy/no-loose-ends' },
			point: { kind: 'stage-in' }
		}
	],
	group: { watchFor: ['monitor/going-in-circles'], breakOn: [] },
	controls: ['test/control-map/one'],
	provenance: {
		author: { kind: 'person', id: 'tester', name: 'A. Tester' },
		createdAt: '2026-09-12T00:00:00Z'
	}
};
const PACK: PackManifest = {
	id: 'test-stacks',
	name: 'Test stacks',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	stacks: [STACK]
};

function registry() {
	const created = createPackRegistry();
	created.registerPack(starterPack);
	created.registerPack(PACK);
	return created;
}

describe('resolveGuardStack', () => {
	it('puts the stack’s loop and egress fits after the guard’s own components, and takes its group', () => {
		const guard: CampaignGuard = {
			id: 'stacked',
			fit: [],
			components: [
				{ id: 'governance/step-budget', config: { maxTicks: 9 }, point: { kind: 'pre-think' } }
			],
			stack: STACK.id
		};
		const resolved = resolveGuardStack(guard, registry());
		expect(resolved.components?.map((fit) => [fit.id, fit.point?.kind])).toEqual([
			['governance/step-budget', 'pre-think'],
			['governance/step-budget', 'pre-think'],
			['governance/action-blocklist', 'pre-act'],
			['governance/egress-none', 'egress']
		]);
		expect(resolved.group).toMatchObject({ watchFor: ['monitor/going-in-circles'], breakOn: [] });
		// The chain a cell runs: the loop fits (the egress fit compiles to nothing) — and the group half compiles too.
		const chain = componentChainFor(resolved, registry());
		expect(chain.map((guardrail) => guardrail.componentId)).toEqual([
			'governance/step-budget',
			'governance/step-budget',
			'governance/action-blocklist'
		]);
		expect(groupStackFor(resolved, registry()).guardrails.length).toBeGreaterThan(0);
	});

	it('leaves a guard with no stack alone, keeps the guard’s own group over the stack’s, and refuses an unknown stack', () => {
		const plain: CampaignGuard = { id: 'none', fit: [] };
		expect(resolveGuardStack(plain, registry())).toBe(plain);
		const own: CampaignGuard = {
			id: 'own',
			fit: [],
			stack: STACK.id,
			group: { watchFor: [], breakOn: [], refusalLimit: 2 }
		};
		expect(resolveGuardStack(own, registry()).group).toMatchObject({
			refusalLimit: 2,
			watchFor: []
		});
		expect(() =>
			resolveGuardStack({ id: 'x', fit: [], stack: 'nobody/stack/y' }, registry())
		).toThrow(/no pack ships/);
	});
});

describe('an experiment’s guard factor over stack ids', () => {
	it('a level naming no template guard becomes a guard by that stack', () => {
		const base = injectionBaseline([1]);
		const OMITTED = new Set(['schemaVersion', 'id', 'title', 'seeds', 'gates']);
		const template = Object.fromEntries(Object.entries(base).filter(([key]) => !OMITTED.has(key)));
		const experiment = experimentSchema.parse({
			schemaVersion: 1,
			id: 'stacks-exp',
			title: 'Stacks',
			hypothesis: 'A stack helps.',
			controls: [],
			obligations: [],
			design: {
				template: { ...template, guards: base.guards.slice(0, 1) },
				factors: [{ axis: 'guard', levels: [base.guards[0]!.id, STACK.id] }],
				baseline: { guard: base.guards[0]!.id },
				metrics: [
					{
						kind: 'evaluator-pass-rate',
						id: 'safe',
						evaluatorId: 'starter/never-says-the-code',
						direction: 'higher-is-better'
					}
				],
				seeds: [1],
				replicates: 1
			}
		});
		const campaign = campaignFor(experiment, { guard: STACK.id });
		expect(campaign.guards).toEqual([{ id: STACK.id, fit: [], stack: STACK.id }]);
	});
});
