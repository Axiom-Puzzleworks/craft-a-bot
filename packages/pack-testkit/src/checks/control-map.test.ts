import { createPackRegistry, type ControlMap, type PackManifest } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import { checkControlMap } from './control-map.js';
import { checkManifest } from './manifest.js';

/**
 * `checkControlMap` (WP67, `53-…` §4.1, §11 item 1): a dangling evidence id
 * of every kind is refused, an unknown artefact is refused, a pending row
 * with evidence is refused, a duplicate ref is refused — and a map whose
 * every claim resolves passes, through `checkManifest` too.
 */
const card = {
	id: 'demo/policy/no-fire',
	title: 'No fire',
	description: 'x',
	schemaVersion: 1 as const,
	rules: [
		{
			hook: 'pre-act' as const,
			when: { kind: 'call-name-is' as const, value: 'fire' },
			then: 'block-action' as const,
			reason: 'x'
		}
	]
};
const evaluator = {
	id: 'demo/judge',
	name: 'Judge',
	description: 'x',
	kind: 'deterministic' as const,
	evaluate: () =>
		Promise.resolve({
			evaluatorId: 'demo/judge',
			verdict: 'pass' as const,
			explanation: 'x',
			evidence: []
		})
};

const good: ControlMap = {
	id: 'demo/control-map',
	title: 'Demo',
	description: 'x',
	rows: [
		{
			framework: 'F',
			ref: 'one',
			title: 'One',
			obligation: 'x',
			evidence: [
				{ kind: 'policy-card', id: card.id },
				{ kind: 'evaluator', id: evaluator.id },
				{ kind: 'guardrail', id: 'safety/step-budget' },
				{ kind: 'gate', id: 'parity' },
				{ kind: 'trace-guarantee', id: 'approval.requested' },
				{ kind: 'egress', id: 'none' },
				{ kind: 'principal', id: 'run.started.principal' },
				{ kind: 'artefact', id: 'agent-card' }
			],
			tags: ['fca:cd:support'],
			status: 'unreviewed'
		},
		{
			framework: 'F',
			ref: 'two',
			title: 'Two',
			obligation: 'x',
			evidence: [],
			tags: [],
			status: 'pending',
			note: 'Waits for WP72.'
		}
	]
};

const manifest: PackManifest = {
	id: 'demo',
	name: 'Demo',
	version: '1.0.0',
	requiresCore: '>=1.0.0',
	policyCards: [card],
	evaluators: [evaluator],
	controlMaps: [good]
};

const registryWith = (): ReturnType<typeof createPackRegistry> => {
	const registry = createPackRegistry();
	registry.registerPack(manifest);
	return registry;
};
const options = { knownGuardrails: ['safety/step-budget'], knownTags: ['fca:cd:support'] };
const withRows = (rows: ControlMap['rows']): ControlMap => ({ ...good, rows });
const checks = (map: ControlMap) =>
	checkControlMap(map, registryWith(), options).map((issue) => issue.check);

describe('checkControlMap', () => {
	it('passes a map whose every claim resolves, and registers it', () => {
		expect(checkControlMap(good, registryWith(), options)).toEqual([]);
		expect(checkManifest(manifest, { controlMaps: options })).toEqual([]);
		expect(registryWith().getControlMap(good.id)?.rows).toHaveLength(2);
		expect(
			registryWith()
				.listControlMaps()
				.map((map) => map.id)
		).toEqual([good.id]);
	});

	it('refuses a dangling id of every kind, and an unknown artefact', () => {
		const one = good.rows[0]!;
		const cases: Array<[string, ControlMap['rows'][number]['evidence'][number]]> = [
			['policy-card', { kind: 'policy-card', id: 'demo/policy/nope' }],
			['evaluator', { kind: 'evaluator', id: 'demo/nope' }],
			['guardrail', { kind: 'guardrail', id: 'safety/nope' }],
			['gate', { kind: 'gate', id: 'vibes' }],
			['trace-guarantee', { kind: 'trace-guarantee', id: 'thing.happened' }],
			['egress', { kind: 'egress', id: 'sometimes' }],
			['principal', { kind: 'principal', id: 'who' }],
			['artefact', { kind: 'artefact', id: 'the-vibes' }]
		];
		for (const [kind, item] of cases) {
			const issues = checkControlMap(
				withRows([{ ...one, evidence: [item] }]),
				registryWith(),
				options
			);
			expect(
				issues.map((issue) => issue.check),
				kind
			).toEqual(['control-map.evidence-resolves']);
			expect(issues[0]?.message).toContain(item.id);
		}
	});

	it('refuses a pending row with evidence or no note, a row with no evidence, a duplicate ref, an unknown tag', () => {
		const one = good.rows[0]!;
		const two = good.rows[1]!;
		expect(checks(withRows([{ ...two, evidence: one.evidence }]))).toEqual([
			'control-map.pending-has-no-evidence'
		]);
		const { note: _note, ...twoWithoutNote } = two;
		void _note;
		expect(checks(withRows([twoWithoutNote]))).toEqual(['control-map.pending-names-its-wp']);
		expect(checks(withRows([{ ...one, evidence: [] }]))).toEqual(['control-map.row-has-evidence']);
		expect(checks(withRows([one, { ...one }]))).toEqual(['control-map.ref-unique']);
		expect(checks(withRows([{ ...one, tags: ['made-up'] }]))).toEqual(['control-map.tags-known']);
		expect(checks(withRows([]))).toEqual(['control-map.rows']);
		// Tags are not judged when no vocabulary is handed in.
		expect(
			checkControlMap(withRows([{ ...one, tags: ['made-up'] }]), registryWith(), {
				knownGuardrails: options.knownGuardrails
			})
		).toEqual([]);
	});

	it('checkManifest refuses an unqualified map id', () => {
		const issues = checkManifest({
			...manifest,
			controlMaps: [{ ...good, id: 'elsewhere/control-map' }]
		});
		expect(issues.map((issue) => issue.check)).toContain('manifest.ids-qualified');
	});
});
