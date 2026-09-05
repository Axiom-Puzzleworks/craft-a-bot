import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { BoundaryMap } from '@craftabot/governance/reports';
import Boundary from './Boundary.svelte';

/**
 * The map component (WP57 stage C, `44-…` §4.5): every node and edge has
 * an id and a label, the image has a sentence, the list beneath is the
 * whole truth, and the tick lights the edges the fold says fired.
 */
const map: BoundaryMap = {
	schemaVersion: 1,
	agent: {
		id: 'a',
		name: 'Analyst bot',
		bricks: [
			{ slot: 'brain', kindId: 'starter/llm', name: 'Brain Brick' },
			{ slot: 'safety', kindId: 'workshop/guard', name: 'Guard Brick' }
		]
	},
	boundary: {
		safetyStack: [{ kindId: 'workshop/guard', name: 'Guard Brick' }],
		guardrailIds: ['guard/screen'],
		egress: { mode: 'declared', hosts: ['api.openai.com', 'modelarmor.*.rep.googleapis.com'] },
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
			id: 'geap/model-armor',
			name: 'Model Armor',
			hosts: ['modelarmor.*.rep.googleapis.com'],
			sends: ['decision'],
			credential: 'geap'
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
		{ tick: 1, edge: 'guard-service:geap/model-armor', eventId: 'e2', outcome: 'offline' },
		{ tick: 2, edge: 'human', eventId: 'e3' },
		{ tick: 2, edge: 'world', eventId: 'e4' },
		{ tick: 3, edge: 'sink:telemetry/otlp-http', eventId: 'e5', verdict: 'outside-egress' }
	]
};

describe('Boundary', () => {
	it('draws every outside node and edge with an id, a label and its hosts', () => {
		render(Boundary, { map });
		expect(screen.getByTestId('boundary-node-provider-openai').textContent).toContain(
			'api.openai.com'
		);
		expect(screen.getByTestId('boundary-node-provider-openai').textContent).toContain('🔑');
		expect(
			screen.getByTestId('boundary-node-guard-service-guard-local/llama-guard').textContent
		).toContain('local');
		expect(screen.getByTestId('boundary-edge-guard-service:geap/model-armor')).not.toBeNull();
		expect(screen.getByTestId('boundary-edge-human')).not.toBeNull();
		expect(screen.getByTestId('boundary-edge-world')).not.toBeNull();
		expect(screen.getByTestId('boundary-edge-counterpart:c1')).not.toBeNull();
	});

	it('says the whole map in a sentence and lists every edge for a reader', () => {
		render(Boundary, { map });
		const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
		expect(label).toContain('Analyst bot at the centre');
		expect(label).toContain('1 safety brick');
		expect(label).toContain('set to declared with 2 hosts');
		expect(label).toContain('desk The Front Desk and 1 counterpart');
		expect(label).toContain('2 approvals');
		const list = screen.getByRole('list', { name: 'Every edge' });
		expect(list.textContent).toContain('sends prompt, credential-header');
		expect(list.textContent).toContain('credential geap');
		expect(list.textContent).toContain('approval risky (collaborator)');
		expect(list.textContent).toContain('reached a host the run never declared');
	});

	it('lights the edges the fold says fired at the tick, and no others', () => {
		const { unmount } = render(Boundary, { map, tick: 1 });
		expect(screen.getByTestId('boundary-edge-provider').getAttribute('data-lit')).toBe('true');
		expect(
			screen.getByTestId('boundary-edge-guard-service:geap/model-armor').getAttribute('data-lit')
		).toBe('true');
		expect(screen.getByTestId('boundary-edge-human').getAttribute('data-lit')).toBe('false');
		expect(screen.getByRole('img').getAttribute('aria-label')).toContain(
			'At turn 1, lit: provider, guard-service:geap/model-armor'
		);
		unmount();
		render(Boundary, { map, tick: 2 });
		expect(screen.getByTestId('boundary-edge-human').getAttribute('data-lit')).toBe('true');
		expect(screen.getByTestId('boundary-edge-world').getAttribute('data-lit')).toBe('true');
		expect(screen.getByTestId('boundary-edge-provider').getAttribute('data-lit')).toBe('false');
	});

	it('marks the egress gate closed when the run named none', () => {
		render(Boundary, {
			map: { ...map, boundary: { ...map.boundary, egress: { mode: 'none', hosts: [] } } }
		});
		expect(screen.getByTestId('boundary-egress').getAttribute('class')).toContain('gate--closed');
	});
});
