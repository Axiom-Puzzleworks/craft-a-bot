import type { BoundaryMap } from '@craftabot/governance/reports';
import { describe, expect, it } from 'vitest';
import { layoutBoundary, overlappingLabels } from './boundary-layout.js';

/**
 * The Boundary's layout invariant (WP86, `77-…` §5; UX-7): however crowded
 * the map — the bank's ten lines, three workflows' twenty-five stages, a
 * provider, two guard services, a sink and an evidence store — no two
 * labels overlap; a label that had to move carries a leader; a map with no
 * workflows draws no ring; the outer radius grows with the crowd.
 */
const base: BoundaryMap = {
	schemaVersion: 1,
	agent: {
		id: 'a',
		name: 'Lendbot',
		bricks: [{ slot: 'brain', kindId: 'starter/llm', name: 'LLM' }]
	},
	boundary: {
		safetyStack: [{ kindId: 'starter/safety', name: 'Safety' }],
		guardrailIds: [],
		egress: { mode: 'none', hosts: [] },
		approval: { mode: 'risky', riskTiers: ['irreversible'] }
	},
	inside: {
		world: { id: 'fs-bank', name: 'The Bank (synthetic)', view: 'desk' },
		counterparts: [{ agentId: 'c', name: 'Customer', role: 'counterpart' }]
	},
	outside: [],
	human: { approvals: 2 }
};

const lines = [
	'core-banking',
	'the-crm',
	'credit-bureau',
	'payments',
	'cards',
	'kyc',
	'graph',
	'product-shelf',
	'complaints-register',
	'sanctions'
].map((id) => ({
	kind: 'service-line' as const,
	id: `fs-bank/${id}`,
	name: id.replaceAll('-', ' '),
	hosts: [],
	sends: []
}));

const stagesOf = (names: string[]) =>
	names.map((name, index) => ({
		id: name.toLowerCase().replaceAll(' ', '-'),
		name,
		executor: (['agent', 'rule', 'human', 'line'] as const)[index % 4]!,
		...(index % 3 === 0 ? { status: 'ok' as const } : {})
	}));

const crowded: BoundaryMap = {
	...base,
	outside: [
		{
			kind: 'provider',
			id: 'openai',
			name: 'OpenAI',
			hosts: ['api.openai.com'],
			sends: ['prompt']
		},
		{
			kind: 'guard-service',
			id: 'geap/model-armor',
			name: 'Model Armor',
			hosts: ['modelarmor.googleapis.com'],
			sends: ['prompt'],
			credential: 'geap'
		},
		{
			kind: 'guard-service',
			id: 'azure/content-safety',
			name: 'Azure AI Content Safety',
			hosts: ['contentsafety.azure.com'],
			sends: ['prompt']
		},
		{
			kind: 'sink',
			id: 'telemetry/otlp-http',
			name: 'OTLP collector',
			hosts: ['collector.test'],
			sends: ['spans']
		},
		{
			kind: 'evidence-store',
			id: 'evidence/supabase',
			name: 'Supabase evidence',
			hosts: ['xyz.supabase.co'],
			sends: ['bundles']
		},
		...lines
	],
	workflows: [
		{
			id: 'fs-lending/lending',
			name: 'The lending journey',
			stages: stagesOf([
				'Intake',
				'Identity',
				'Bureau file',
				'Affordability',
				'Decision',
				'Decision recorded',
				'Explanation',
				'Four eyes',
				'Disbursement',
				'Appeal'
			])
		},
		{
			id: 'fs-fraud/fraud',
			name: 'The alert journey',
			stages: stagesOf([
				'Alert',
				'Triage',
				'Contact',
				'Decision',
				'Restriction recorded',
				'Suspicious-activity report',
				'Report filed',
				'Closing note'
			])
		},
		{
			id: 'fs-advice/advice',
			name: 'The advice journey',
			stages: stagesOf([
				'Request',
				'Suitability',
				'Recommendation',
				'Warnings',
				'Consent',
				'Execution',
				'Confirmation'
			])
		}
	]
};

describe('layoutBoundary', () => {
	it('places every label with no two overlapping on a crowded map, leader-lining the ones it moved', () => {
		const layout = layoutBoundary(crowded, new Set());
		expect(overlappingLabels(layout)).toEqual([]);
		expect(layout.stages).toHaveLength(25);
		expect(layout.rings.map((ring) => ring.workflowId)).toEqual([
			'fs-lending/lending',
			'fs-fraud/fraud',
			'fs-advice/advice'
		]);
		expect(layout.outside).toHaveLength(15);
		// The outer radius grew to fit fifteen boxes around the circle, and the canvas with it.
		expect(layout.width).toBeGreaterThan(760);
		const moved = layout.labels.filter((label) => label.moved);
		expect(moved.length).toBeGreaterThan(0);
		for (const label of moved) expect(label.anchor).not.toEqual({ x: label.x, y: label.y });
		// Every stage has its label and its actor.
		for (const stage of layout.stages)
			expect(layout.labels.some((label) => label.id === `stage:${stage.id}`)).toBe(true);
	});

	it('draws no ring for a map with no workflows and keeps the classic canvas', () => {
		const layout = layoutBoundary(base, new Set());
		expect(layout.rings).toEqual([]);
		expect(layout.stages).toEqual([]);
		expect(layout.width).toBe(760);
		expect(layout.height).toBe(520);
		expect(overlappingLabels(layout)).toEqual([]);
		expect(layout.labels.find((label) => label.id === 'agent')?.lines).toEqual(['Lendbot']);
	});

	it('lights the edges the tick names and flags an edge that reached outside the egress', () => {
		const withActivity: BoundaryMap = {
			...crowded,
			activity: [
				{ tick: 3, edge: 'provider', eventId: 'e1' },
				{
					tick: 3,
					edge: 'guard-service:geap/model-armor',
					eventId: 'e2',
					verdict: 'outside-egress'
				}
			]
		};
		const layout = layoutBoundary(withActivity, new Set(['provider']));
		expect(layout.outside.find((node) => node.edge === 'provider')?.lit).toBe(true);
		expect(
			layout.outside.find((node) => node.edge === 'guard-service:geap/model-armor')?.flagged
		).toBe(true);
	});
});
