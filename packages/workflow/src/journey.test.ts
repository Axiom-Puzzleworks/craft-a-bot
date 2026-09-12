import type { Stack, StageSpec, WorkflowRun, WorkflowSpec } from '@craftabot/core';
import { describe, expect, it } from 'vitest';
import {
	CASE_LABEL,
	TAKEN_LABEL,
	edgesOf,
	journeyGeometry,
	journeyLayout,
	journeySentence,
	laneOf,
	outcomesOf,
	renderJourneySvg
} from './journey.js';

/**
 * WP100 stage B (`87-JOURNEY-CANVAS.md` §3–§4): the layout's rules over a
 * hand-built journey — lanes by effective executor, the enumeration over
 * enums and options, the *depends on the case* edge, the handoff, the
 * points, the lit run's observed edge — and the geometry and SVG that
 * follow from it.
 */
const OUT_ENUM = {
	type: 'object',
	properties: { outcome: { enum: ['approve', 'decline', 'refer'] }, reasons: { type: 'array' } }
} as const;
const OUT_ONE = { type: 'object', properties: { verified: { const: true } } } as const;
const OUT_PLAIN = { type: 'object', properties: { text: { type: 'string' } } } as const;

const stage = (overrides: Partial<StageSpec> & Pick<StageSpec, 'id' | 'next'>): StageSpec => ({
	name: overrides.id,
	input: OUT_PLAIN,
	output: OUT_PLAIN,
	executor: { kind: 'rule', rule: `${overrides.id}-v1` },
	...overrides
});

const spec: WorkflowSpec = {
	id: 'test/journey',
	name: 'A test journey',
	worldId: 'test/world',
	purpose: 'testing',
	intake: () => ({ layoutId: 'x', input: {} }),
	first: 'intake',
	obligations: [],
	stages: [
		stage({ id: 'intake', next: () => 'check' }),
		stage({
			id: 'check',
			output: OUT_ONE,
			executor: { kind: 'agent', until: 'checked' },
			guards: { policyCards: ['card/a'], components: [{ id: 'comp/out', point: 'stage-out' }] },
			next: () => 'decide'
		}),
		stage({
			id: 'decide',
			output: OUT_ENUM,
			executor: { kind: 'agent', until: 'decided' },
			obligations: ['equality-act:fairness'],
			next: (out) => ((out as { outcome: string }).outcome === 'refer' ? 'review' : 'pay')
		}),
		stage({
			id: 'review',
			executor: { kind: 'human', prompt: 'Review', options: ['confirm', 'return'] },
			next: (out) => ((out as { decision: string }).decision === 'confirm' ? 'pay' : 'decide')
		}),
		stage({
			id: 'pay',
			executor: { kind: 'line', lineId: 'ledger', operation: 'pay' },
			irreversible: true,
			next: (_out, state) => ((state as { paid?: boolean }).paid ? 'end' : 'handoff:test/other')
		}),
		stage({ id: 'orphan', next: () => 'handoff:test/other' })
	],
	configurations: {
		'rules-only': { executors: { check: { kind: 'rule', rule: 'check-v1' } } }
	}
};

const stack: Stack = {
	schemaVersion: 1,
	id: 'test/stack',
	name: 'The stack',
	description: 'for the test',
	fit: [
		{ componentId: 'comp/loop', point: { kind: 'pre-act' } },
		{ componentId: 'comp/in', point: { kind: 'stage-in', at: 'decide' } },
		{ componentId: 'comp/egress', point: { kind: 'egress' } }
	],
	group: { watchFor: [], breakOn: [{ evaluatorId: 'eval/x' }] },
	provenance: { author: { kind: 'user', id: 'test' }, createdAt: '2026-09-12T00:00:00.000Z' }
} as Stack;
const registry = { getStack: (id: string) => (id === stack.id ? stack : undefined) };

describe('the enumeration', () => {
	it('maps executors to lanes', () => {
		expect(['rule', 'agent', 'human', 'line'].map((k) => laneOf(k as 'rule'))).toEqual([
			'rules',
			'assistant',
			'colleague',
			'systems'
		]);
	});

	it('reads a person’s options, the first enum property, a lone value, or nothing', () => {
		const human = { kind: 'human', prompt: 'p', options: ['a', 'b'] } as const;
		expect(outcomesOf({ output: OUT_PLAIN }, human)).toEqual([
			{ label: 'a', value: { decision: 'a' } },
			{ label: 'b', value: { decision: 'b' } }
		]);
		const rule = { kind: 'rule', rule: 'r' } as const;
		expect(outcomesOf({ output: OUT_ENUM }, rule).map((o) => o.label)).toEqual([
			'approve',
			'decline',
			'refer'
		]);
		expect(outcomesOf({ output: OUT_ONE }, rule)).toEqual([
			{ label: '', value: { verified: true } }
		]);
		expect(outcomesOf({ output: OUT_PLAIN }, rule)).toEqual([{ label: '', value: {} }]);
	});

	it('joins the outcomes that reach one target, and gives a case edge to a next that reads the state', () => {
		const decide = spec.stages[2] as StageSpec;
		expect(edgesOf(spec, decide, decide.executor)).toEqual([
			{
				id: 'decide->pay',
				from: 'decide',
				to: 'pay',
				label: 'approve / decline',
				kind: 'enumerated'
			},
			{ id: 'decide->review', from: 'decide', to: 'review', label: 'refer', kind: 'enumerated' }
		]);
		const pay = spec.stages[4] as StageSpec;
		expect(edgesOf(spec, pay, pay.executor)).toEqual([
			{ id: 'pay->orphan', from: 'pay', to: 'orphan', label: CASE_LABEL, kind: 'case' }
		]);
	});

	it('reads a handoff and refuses a stage that does not exist', () => {
		const orphan = spec.stages[5] as StageSpec;
		expect(edgesOf(spec, orphan, orphan.executor)[0]?.to).toEqual({ handoff: 'test/other' });
		const broken = stage({ id: 'broken', next: () => 'nowhere' });
		expect(() => edgesOf(spec, broken, broken.executor)).toThrow(/names no stage/);
	});
});

describe('journeyLayout', () => {
	it('places the stages in journey order on the lanes in use, with the points a stage and a stack put there', () => {
		const layout = journeyLayout(spec, { stack: stack.id }, undefined, { registry });
		expect(layout.lanes.map((lane) => lane.id)).toEqual([
			'assistant',
			'colleague',
			'rules',
			'systems'
		]);
		expect(layout.nodes.map((node) => [node.stageId, node.lane, node.x, node.y])).toEqual([
			['intake', 'rules', 0, 2],
			['check', 'assistant', 1, 0],
			['decide', 'assistant', 2, 0],
			['pay', 'systems', 3, 3],
			['review', 'colleague', 4, 1],
			['orphan', 'rules', 5, 2]
		]);
		const check = layout.nodes.find((node) => node.stageId === 'check');
		expect(check?.guards).toEqual([
			'loop:check:pre-think',
			'loop:check:pre-act',
			'loop:check:post-act',
			'boundary:check:stage-in',
			'boundary:check:stage-out'
		]);
		const byId = new Map(layout.points.map((point) => [point.id, point.components]));
		expect(byId.get('loop:check:pre-act')).toEqual(['comp/loop']);
		expect(byId.get('boundary:check:stage-in')).toEqual(['card/a']);
		expect(byId.get('boundary:check:stage-out')).toEqual(['comp/out']);
		expect(byId.get('boundary:decide:stage-in')).toEqual(['comp/in']);
		expect(byId.get('group')).toEqual(['evaluator:eval/x']);
		expect(byId.get('egress')).toEqual(['comp/egress']);
		expect(layout.nodes.find((node) => node.stageId === 'pay')?.irreversible).toBe(true);
		expect(layout.nodes.find((node) => node.stageId === 'decide')?.obligations).toEqual([
			'equality-act:fairness'
		]);
	});

	it('moves a stage to the configuration’s lane, draws the counterpart lane on request, and refuses a stack it cannot find', () => {
		const layout = journeyLayout(spec, spec.configurations?.['rules-only'], undefined, {
			counterpart: true
		});
		expect(layout.lanes[0]?.id).toBe('counterpart');
		expect(layout.nodes.find((node) => node.stageId === 'check')?.lane).toBe('rules');
		expect(layout.points.filter((point) => point.at === 'check')).toEqual([
			expect.objectContaining({ id: 'boundary:check:stage-in' }),
			expect.objectContaining({ id: 'boundary:check:stage-out' })
		]);
		expect(() => journeyLayout(spec, { stack: 'test/missing' }, undefined, { registry })).toThrow(
			/no stack/
		);
	});

	it('lights a run: the path, the edges taken, an observed edge where the enumeration had none, the verdicts on their points', () => {
		const record = (stageId: string, endedTick: number): WorkflowRun['stages'][number] => ({
			stageId,
			executor: { kind: 'rule', rule: 'x' },
			startedTick: 0,
			endedTick,
			durationMs: 0,
			input: { digest: 'd' },
			output: { digest: 'd' },
			guards: { checked: 0, tripped: [] },
			status: 'ok'
		});
		const run: Pick<WorkflowRun, 'stages' | 'events'> = {
			stages: [
				record('intake', 1),
				{
					...record('check', 2),
					guards: {
						checked: 1,
						tripped: [],
						verdicts: [
							{ guardrailId: 'g', point: 'stage-out', verdict: 'allow', componentId: 'comp/out' }
						]
					}
				},
				record('decide', 3),
				record('pay', 4)
			],
			events: []
		};
		const layout = journeyLayout(spec, undefined, run);
		expect(layout.lit?.path).toEqual(['intake', 'check', 'decide', 'pay']);
		expect(layout.lit?.edges).toEqual([
			'intake->check',
			'check->decide',
			'decide->pay',
			'pay->end'
		]);
		const observed = layout.edges.find((edge) => edge.id === 'pay->end');
		expect(observed).toEqual({
			id: 'pay->end',
			from: 'pay',
			to: { end: true },
			label: TAKEN_LABEL,
			kind: 'observed',
			taken: true
		});
		expect(layout.edges.filter((edge) => edge.taken).map((edge) => edge.id)).toEqual(
			layout.lit?.edges
		);
		expect(layout.lit?.verdicts).toEqual([
			{
				pointId: 'boundary:check:stage-out',
				guardrailId: 'g',
				componentId: 'comp/out',
				verdict: 'allow',
				tick: 2
			}
		]);
		// The run's executor is the lane: this run's `check` was a rule.
		expect(layout.nodes.find((node) => node.stageId === 'check')?.lane).toBe('rules');
	});

	it('draws the counterpart lane when the run seated one', () => {
		const layout = journeyLayout(spec, undefined, {
			stages: [],
			events: [
				{
					type: 'group.started',
					seq: 0,
					runId: '11111111-1111-4111-8111-111111111111',
					timestamp: '2026-09-12T00:00:00.000Z',
					tick: 0,
					payload: {
						groupRunId: '11111111-1111-4111-8111-111111111111',
						memberRunIds: [],
						memberAgentIds: [],
						memberRoles: { a: 'agent', b: 'counterpart' }
					}
				} as WorkflowRun['events'][number]
			]
		});
		expect(layout.lanes[0]?.id).toBe('counterpart');
	});
});

describe('the geometry and the SVG', () => {
	const layout = journeyLayout(spec, { stack: stack.id }, undefined, { registry });

	it('gives every node its own column and every lane its own band, and routes every edge', () => {
		const g = journeyGeometry(layout);
		expect(new Set(g.nodes.map((node) => node.cx)).size).toBe(g.nodes.length);
		expect(g.lanes.map((lane) => lane.y)).toEqual([16, 116, 216, 316]);
		expect(g.edges.map((edge) => edge.id)).toEqual(layout.edges.map((edge) => edge.id));
		for (const edge of g.edges) expect(edge.path).toMatch(/^M\d+ \d+( [HV]\d+)+$/);
		expect(g.points.map((point) => point.id)).toEqual(layout.points.map((point) => point.id));
		expect(g.points.find((point) => point.id === 'group')?.shape).toBe('bar');
		expect(g.points.find((point) => point.id === 'egress')?.shape).toBe('gate');
		// A return (review → decide) leaves from the bottom; a long edge (decide → pay skips nothing here, but pay → orphan spans two columns) runs along the target's lane top.
		expect(g.edges.find((edge) => edge.id === 'review->decide')?.path).toMatch(/^M\d+ \d+ V/);
		expect(g.edges.find((edge) => edge.id === 'pay->orphan')?.path.split(' ').length).toBe(6);
		// No edge reaches the end here (pay hands off); the end bar appears only when one does.
		expect(g.end).toBeUndefined();
		const withEnd = journeyLayout({
			...spec,
			stages: [...spec.stages.slice(0, 5), stage({ id: 'orphan', next: () => 'end' })]
		});
		expect(journeyGeometry(withEnd).end).toEqual({ x: 1103, y1: 24, y2: 408 });
	});

	it('renders one monochrome SVG with a title, byte-stable', () => {
		const svg = renderJourneySvg(layout);
		expect(svg).toBe(
			renderJourneySvg(journeyLayout(spec, { stack: stack.id }, undefined, { registry }))
		);
		expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
		expect(svg).not.toMatch(/#[0-9a-f]{3,6}\b/i);
		expect(svg).toContain(`<title id="journey-title">${journeySentence(layout)}</title>`);
		expect((svg.match(/data-stage="/g) ?? []).length).toBe(layout.nodes.length);
		expect((svg.match(/data-edge="/g) ?? []).length).toBe(layout.edges.length);
		expect((svg.match(/data-point="/g) ?? []).length).toBe(layout.points.length);
		expect(svg).toContain('edge--case');
		expect(svg).toContain('node--irreversible');
	});

	it('reads as a sentence', () => {
		expect(journeySentence(layout)).toContain('decide to pay on approve / decline');
		expect(journeySentence(layout)).toContain('pay to orphan on depends on the case');
	});
});
