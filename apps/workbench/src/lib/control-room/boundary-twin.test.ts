import type { BoundaryMap } from '@craftabot/governance/reports';
import { describe, expect, it } from 'vitest';
import { layoutBoundary } from './boundary-layout.js';
import { boundaryTwin, twinSentence, twinStops } from './boundary-twin.js';

/**
 * WP110 (`97-ACCESS.md` §3): the Boundary's twin equals its drawing — one
 * row per outside node and per stage in the layout's own order, every ring
 * element and inside occupant present, a sentence per stop.
 */
const map: BoundaryMap = {
	schemaVersion: 1,
	agent: { id: 'a', name: 'Analyst bot', bricks: [] },
	boundary: {
		safetyStack: [{ kindId: 'workshop/guard', name: 'Guard Brick' }],
		guardrailIds: ['guard/screen'],
		egress: { mode: 'declared', hosts: ['api.openai.com'] },
		approval: { mode: 'risky', autonomy: 'collaborator', riskTiers: ['irreversible'] }
	},
	inside: {
		world: { id: 'workshop/the-desk', name: 'The Front Desk', view: 'desk' },
		counterparts: [{ agentId: 'c1', name: 'caller' }]
	},
	outside: [
		{
			kind: 'provider',
			id: 'openai',
			name: 'OpenAI',
			hosts: ['api.openai.com'],
			sends: ['prompt', 'credential-header'],
			credential: 'openai'
		},
		{
			kind: 'guard-service',
			id: 'guard-local/llama-guard',
			name: 'Llama Guard',
			hosts: [],
			sends: []
		},
		{
			kind: 'sink',
			id: 'telemetry/otlp-http',
			name: 'OTLP',
			hosts: ['collector.test'],
			sends: ['trace']
		}
	],
	human: { approvals: 2 },
	activity: [
		{ tick: 1, edge: 'provider', eventId: 'e1' },
		{ tick: 3, edge: 'sink:telemetry/otlp-http', eventId: 'e5', verdict: 'outside-egress' }
	],
	workflows: [
		{
			id: 'fs-lending/lending',
			name: 'The lending journey',
			stages: [
				{ id: 'intake', name: 'Intake', executor: 'rule', status: 'ok' },
				{ id: 'decision', name: 'Decision', executor: 'agent' },
				{ id: 'confirm', name: 'Four eyes', executor: 'human' }
			]
		}
	]
};

describe('the Boundary’s twin', () => {
	const layout = layoutBoundary(map, new Set(['provider', 'sink:telemetry/otlp-http']));
	const rows = boundaryTwin(layout, map);

	it('has one row per outside node, in the layout’s order, with its facts', () => {
		const outside = rows.filter((row) => row.kind === 'outside');
		expect(outside.map((row) => row.edge)).toEqual(layout.outside.map((node) => node.edge));
		expect(outside[0]).toMatchObject({
			id: 'outside:provider',
			label: 'provider',
			lit: true,
			flagged: false
		});
		expect(outside[0]?.detail).toBe(
			'OpenAI — api.openai.com · sends prompt, credential-header · credential openai · lit'
		);
		const sink = outside.find((row) => row.edge === 'sink:telemetry/otlp-http');
		expect(sink?.flagged).toBe(true);
		expect(sink?.detail).toContain('reached a host the run never declared');
		expect(
			outside.find((row) => row.edge === 'guard-service:guard-local/llama-guard')?.detail
		).toBe('Llama Guard — local');
	});

	it('has the ring — every safety brick, the person, the gate, the rules — and the inside', () => {
		expect(rows.filter((row) => row.kind === 'ring').map((row) => row.id)).toEqual([
			'ring:safety:0:workshop/guard',
			'ring:human',
			'ring:egress',
			'ring:rules'
		]);
		expect(rows.find((row) => row.id === 'ring:human')?.detail).toBe(
			'approval risky (collaborator) · 2 crossed'
		);
		expect(rows.find((row) => row.id === 'ring:egress')?.detail).toBe('declared · api.openai.com');
		expect(
			rows.filter((row) => row.kind === 'inside').map((row) => `${row.label} ${row.detail}`)
		).toEqual(['desk The Front Desk', 'counterpart caller']);
	});

	it('has one row per workflow stage, in ring order, with the executor and the status', () => {
		const stages = rows.filter((row) => row.kind === 'stage');
		expect(stages.map((row) => row.stageId)).toEqual(layout.stages.map((stage) => stage.stageId));
		expect(stages[0]).toMatchObject({
			id: 'stage:fs-lending/lending:intake',
			label: 'Intake',
			detail: 'The lending journey · rule · ok',
			lit: true
		});
		expect(stages[1]?.lit).toBe(false);
	});

	it('walks the stops — every outside node, then every stage — and reads each as a sentence', () => {
		const stops = twinStops(rows);
		expect(stops.map((row) => row.kind)).toEqual([
			'outside',
			'outside',
			'outside',
			'stage',
			'stage',
			'stage'
		]);
		expect(twinSentence(stops[0]!)).toMatch(/^provider: OpenAI — api\.openai\.com/);
		expect(new Set(stops.map((row) => twinSentence(row))).size).toBe(stops.length);
	});

	it('is the same rows for the same layout', () => {
		expect(boundaryTwin(layout, map)).toEqual(rows);
	});
});
