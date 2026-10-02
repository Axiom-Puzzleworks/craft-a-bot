import { describe, expect, it } from 'vitest';
import {
	createPackRegistry,
	type ControlMap,
	type GuardrailCatalogue,
	type PackManifest,
	type PolicyCard,
	type Review,
	type RunSummary
} from '@craftabot/core';
import { builtinComponents } from '../components/builtin.js';
import { policyCardComponent } from '../components/policy-card.js';
import { GUARDRAIL_CATALOGUE } from '../catalogue/entries.js';
import { checkControlInventory } from '../controls/check.js';
import {
	campaignUses,
	controlInventory,
	controlInventoryExport,
	controlInventorySummary,
	renderControlInventoryMarkdown,
	tripRef
} from './control-inventory.js';
import type { ControlEffectivenessRow } from './control-effectiveness.js';

/**
 * The Control Inventory (WP133, `110-CONTROL-SUITE-PLAN.md` §4): one row
 * per instance, each facet folded from where it is recorded — the catalogue,
 * the maps, the stacks, the runs, the register, the readings. The whole
 * bank, with the orphan rule, is `harness/src/control-inventory.test.ts`.
 */
const CARD: PolicyCard = {
	id: 'test/policy/no-fire',
	title: 'No fire',
	description: 'Blocks fire.',
	schemaVersion: 1,
	rules: [
		{
			hook: 'pre-act',
			when: { kind: 'call-name-is', value: 'fire' },
			then: 'block-action',
			reason: 'x'
		}
	]
};
const JUDGE = {
	id: 'test/judge',
	name: 'Judge',
	description: 'Judges.',
	kind: 'deterministic' as const,
	evaluate: () =>
		Promise.resolve({
			evaluatorId: 'test/judge',
			verdict: 'pass' as const,
			explanation: '',
			evidence: []
		})
};
const LONELY = { ...JUDGE, id: 'test/lonely', name: 'Lonely' };
const MAP: ControlMap = {
	id: 'test/control-map',
	title: 'Test map',
	description: 'A map.',
	rows: [
		{
			framework: 'FCA Consumer Duty',
			ref: 'support',
			title: 'Support',
			obligation: 'Help.',
			evidence: [
				{ kind: 'evaluator', id: JUDGE.id },
				{ kind: 'policy-card', id: CARD.id },
				{ kind: 'guardrail', id: 'safety/step-budget' },
				{ kind: 'egress', id: 'none' }
			],
			tags: [],
			status: 'unreviewed'
		}
	]
};
const STACK = {
	schemaVersion: 1 as const,
	id: 'test/stack/cards',
	name: 'Cards',
	description: 'The card and a budget.',
	fit: [
		{
			componentId: 'governance/policy-card',
			config: { cardId: CARD.id },
			point: { kind: 'pre-act' as const }
		},
		{
			componentId: 'governance/step-budget',
			config: { maxTicks: 5 },
			point: { kind: 'pre-think' as const }
		}
	],
	controls: ['test/control-map/support'],
	provenance: {
		author: { kind: 'person' as const, id: 'a' },
		createdAt: '2026-10-01T00:00:00.000Z'
	}
};
const PACK = {
	id: 'test',
	name: 'Test',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	policyCards: [CARD],
	evaluators: [JUDGE, LONELY],
	controlMaps: [MAP],
	stacks: [STACK],
	guardrailComponents: [...builtinComponents, policyCardComponent as never]
} as unknown as PackManifest;

function registry() {
	const created = createPackRegistry();
	created.registerPack(PACK);
	return created;
}

const CATALOGUE: GuardrailCatalogue = GUARDRAIL_CATALOGUE;

describe('controlInventory', () => {
	it('lists every instance once, keyed by its reference, in kind order', () => {
		const rows = controlInventory({ registry: registry(), catalogue: CATALOGUE });
		const refs = rows.map((row) => row.ref);
		expect(new Set(refs).size).toBe(refs.length);
		for (const ref of [
			'component:governance/step-budget',
			'guardrail:connector/tool-blocklist',
			`policy-card:${CARD.id}`,
			`stack:${STACK.id}`,
			`evaluator:${JUDGE.id}`,
			'mechanism:workflow/reader-gate',
			'gate:parity',
			'artefact:assurance-pack'
		])
			expect(refs, ref).toContain(ref);
		// One control, one row: the safety/… guardrails are the built-in components' rows.
		expect(refs).not.toContain('guardrail:safety/step-budget');
		expect(refs.indexOf('component:governance/step-budget')).toBeLessThan(
			refs.indexOf(`policy-card:${CARD.id}`)
		);
	});

	it('takes coverage from the catalogue — a card through the policy-card component, a stack through its fits', () => {
		const rows = controlInventory({ registry: registry(), catalogue: CATALOGUE });
		const budget = rows.find((row) => row.ref === 'component:governance/step-budget')!;
		expect(budget.entries.map((entry) => entry.id)).toContain('budget-cap');
		expect(budget.coverage).toBe('shipped');
		const card = rows.find((row) => row.ref === `policy-card:${CARD.id}`)!;
		expect(card.entries.every((entry) => entry.via === 'component:governance/policy-card')).toBe(
			true
		);
		expect(card.entries.map((entry) => entry.id)).toContain('runtime-enforcement-dsl');
		const stack = rows.find((row) => row.ref === `stack:${STACK.id}`)!;
		expect(stack.entries.map((entry) => entry.id)).toEqual(
			expect.arrayContaining(['budget-cap', 'runtime-enforcement-dsl'])
		);
		// An evaluator inherits the evaluation harness's entry through the evaluator contract (2026-10-02).
		const lonely = rows.find((row) => row.ref === `evaluator:${LONELY.id}`)!;
		expect(lonely.coverage).toBe('shipped');
		expect(lonely.entries.every((entry) => entry.via === 'mechanism:evals/evaluators')).toBe(true);
	});

	it('links the map rows that cite it, and a stack’s claimed rows', () => {
		const rows = controlInventory({ registry: registry(), catalogue: CATALOGUE });
		const at = (ref: string) =>
			rows.find((row) => row.ref === ref)!.rows.map((link) => `${link.mapId}#${link.ref}`);
		expect(at(`evaluator:${JUDGE.id}`)).toEqual(['test/control-map#support']);
		expect(at(`policy-card:${CARD.id}`)).toEqual(['test/control-map#support']);
		expect(at('component:governance/step-budget')).toEqual(['test/control-map#support']);
		// An egress mode is its component's evidence; this registry ships no egress component, so no row.
		expect(rows.some((row) => row.ref === 'component:governance/egress-none')).toBe(false);
		expect(at(`stack:${STACK.id}`)).toEqual(['test/control-map#support']);
	});

	it('says where each is fitted, and what is fitted nowhere', () => {
		const rows = controlInventory({
			registry: registry(),
			catalogue: CATALOGUE,
			campaigns: [
				{
					id: 'test-baseline',
					campaign: {
						guards: [{ id: 'g', components: [{ id: 'governance/no-repetition' }] }],
						evaluators: [{ id: JUDGE.id }],
						gates: [{ id: 'x', require: { kind: 'evaluator-pass-rate', evaluatorId: JUDGE.id } }]
					}
				}
			]
		});
		const fitted = (ref: string) => rows.find((row) => row.ref === ref)!.fitted;
		expect(fitted(`policy-card:${CARD.id}`)).toEqual({
			state: 'fitted',
			where: [`stack ${STACK.id}`]
		});
		expect(fitted('component:governance/no-repetition').where).toEqual(['campaign test-baseline']);
		expect(fitted(`evaluator:${JUDGE.id}`).state).toBe('fitted');
		expect(fitted('gate:evaluator-pass-rate').state).toBe('fitted');
		expect(fitted(`evaluator:${LONELY.id}`).state).toBe('unfitted');
		expect(fitted(`stack:${STACK.id}`).state).toBe('unfitted');
		expect(fitted('mechanism:core/trace').state).toBe('not-applicable');
	});

	it('folds what fired from the runs and reports, and says so when there were none', () => {
		const none = controlInventory({ registry: registry(), catalogue: CATALOGUE });
		expect(none.find((row) => row.ref === `policy-card:${CARD.id}`)!.exercised.state).toBe(
			'no-runs'
		);
		const summary = {
			runId: 'r',
			checks: 3,
			saves: 2,
			guardrailTrips: { [`${CARD.id}#rule-1`]: 2, 'safety/step-budget': 1 },
			approvalsRequested: 0,
			approvalsGranted: 0,
			findings: [],
			decisions: 0,
			hostedPreActScreens: 0,
			schemaVersion: 1
		} as unknown as RunSummary;
		const rows = controlInventory({
			registry: registry(),
			catalogue: CATALOGUE,
			summaries: [summary],
			campaignReports: [
				{
					cells: [{ evaluations: { [JUDGE.id]: 'fail' } }, { evaluations: { [JUDGE.id]: 'pass' } }]
				}
			]
		});
		const exercised = (ref: string) => rows.find((row) => row.ref === ref)!.exercised;
		expect(exercised(`policy-card:${CARD.id}`)).toEqual({ state: 'fired', count: 2 });
		expect(exercised('component:governance/step-budget')).toEqual({ state: 'fired', count: 1 });
		expect(exercised('component:governance/token-budget')).toEqual({
			state: 'not-fired',
			count: 0
		});
		expect(exercised(`evaluator:${JUDGE.id}`)).toEqual({ state: 'fired', count: 1 });
		expect(exercised(`evaluator:${LONELY.id}`).state).toBe('not-run');
		expect(tripRef(`${CARD.id}#rule-1`, registry())).toBe(`policy-card:${CARD.id}`);
	});

	it('takes an instance’s effect from the register rows that cite it, never its desk’s (G103)', () => {
		const register: ControlEffectivenessRow[] = [
			{
				controlId: 'test/control-map/support',
				obligations: [],
				effects: [],
				headline: { metricId: 'pass-rate', delta: 0.2 } as never,
				cost: {},
				coverage: { experiments: 1, populations: [], contexts: [], workflows: [] },
				status: 'evidenced'
			}
		];
		const rows = controlInventory({ registry: registry(), catalogue: CATALOGUE, register });
		const effect = (ref: string) => rows.find((row) => row.ref === ref)!.effect;
		expect(effect(`policy-card:${CARD.id}`)).toMatchObject({
			state: 'evidenced',
			controlIds: ['test/control-map/support'],
			delta: 0.2
		});
		expect(effect(`evaluator:${LONELY.id}`)).toEqual({ state: 'untested', controlIds: [] });
		expect(effect('mechanism:core/trace').state).toBe('not-applicable');
		// WP150: no row cites the policy-card component, but the stack that carries it has a verdict, and says so.
		expect(effect('component:governance/policy-card')).toMatchObject({
			state: 'evidenced',
			via: `stack:${STACK.id}`
		});
	});

	it('counts the readings of what describes it', () => {
		const reviews: Review[] = [
			{
				schemaVersion: 1,
				subject: { kind: 'control-row', id: 'test/control-map#support' },
				verdict: 'accepted',
				by: { kind: 'person', id: 'reader' },
				on: '2026-10-01T00:00:00.000Z'
			} as Review
		];
		const rows = controlInventory({ registry: registry(), catalogue: CATALOGUE, reviews });
		expect(rows.find((row) => row.ref === `evaluator:${JUDGE.id}`)!.reviewed).toEqual({
			state: 'accepted',
			read: 1,
			of: 1
		});
		const card = rows.find((row) => row.ref === `policy-card:${CARD.id}`)!;
		expect(card.reviewed).toEqual({ state: 'accepted', read: 1, of: 1 }); // the inherited entries are the component's to read
		const budget = rows.find((row) => row.ref === 'component:governance/step-budget')!;
		expect(budget.reviewed.state).toBe('unread'); // its catalogue entry is unread
		expect(controlInventorySummary(rows).rows).toBe(rows.length);
	});
});

describe('campaignUses', () => {
	it('reads stacks, components, cards, evaluators and gate kinds out of a campaign file', () => {
		expect(
			campaignUses({
				guards: [
					{ id: 'a', stack: 'p/stack/s' },
					{ id: 'b', components: [{ id: 'governance/taint' }] },
					{
						id: 'c',
						fit: [
							{
								kind: 'starter/safety',
								config: { policyCards: ['p/policy/x'], approval: 'risky', blockedActions: [] }
							}
						]
					}
				],
				evaluators: [{ id: 'p/e' }],
				gates: [
					{ require: { kind: 'parity' } },
					{ require: { kind: 'label-rate', evaluatorId: 'p/f' } }
				]
			})
		).toEqual({
			stacks: ['p/stack/s'],
			components: ['governance/taint', 'governance/step-budget', 'governance/approval-mode'],
			cards: ['p/policy/x'],
			evaluators: ['p/e', 'p/f'],
			gates: ['parity', 'label-rate']
		});
	});
});

describe('checkControlInventory (G118)', () => {
	it('refuses an orphan, a stale declaration and a declaration without a reason', () => {
		const rows = controlInventory({ registry: registry(), catalogue: CATALOGUE });
		const orphan = checkControlInventory(rows, []);
		expect(orphan.map((issue) => [issue.check, issue.ref])).toEqual([
			['inventory.orphan', `evaluator:${LONELY.id}`]
		]);
		expect(
			checkControlInventory(rows, [
				{ ref: `evaluator:${LONELY.id}`, reason: 'A test evaluator nothing cites, on purpose.' }
			])
		).toEqual([]);
		const stale = checkControlInventory(rows, [
			{ ref: `evaluator:${LONELY.id}`, reason: 'A test evaluator nothing cites, on purpose.' },
			{ ref: `evaluator:${JUDGE.id}`, reason: 'Declared, though a map row cites it.' },
			{ ref: 'evaluator:test/gone', reason: 'Declared, though nothing registers it.' },
			{ ref: 'mechanism:core/trace', reason: 'short' }
		]);
		expect(stale.map((issue) => [issue.check, issue.ref])).toEqual([
			['inventory.uncatalogued-stale', `evaluator:${JUDGE.id}`],
			['inventory.uncatalogued-stale', 'evaluator:test/gone'],
			['inventory.uncatalogued-reason', 'mechanism:core/trace'],
			['inventory.uncatalogued-stale', 'mechanism:core/trace']
		]);
	});
});

describe('renderControlInventoryMarkdown', () => {
	it('prints one table per kind and escapes a pipe in a name, so the table holds', () => {
		const rows = controlInventory({ registry: registry(), catalogue: CATALOGUE });
		const piped = rows.map((row) =>
			row.ref === `policy-card:${CARD.id}` ? { ...row, name: 'No fire | ever' } : row
		);
		const markdown = renderControlInventoryMarkdown(
			controlInventoryExport(piped, '2026-10-01T00:00:00.000Z')
		);
		expect(markdown).toContain('# The Control Inventory');
		expect(markdown).toContain('## Policy card (1)');
		expect(markdown).toContain('**No fire \\| ever**');
	});
});
