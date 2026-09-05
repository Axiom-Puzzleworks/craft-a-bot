import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { DeskWorldState, GridWorldState } from '@craftabot/core';
import WorldStage from './WorldStage.svelte';

/**
 * `WorldStage` has four branches and every screen that shows a world goes
 * through it (WP53, `43-…` §4.2). Each branch is drawn here once.
 */
const desk: DeskWorldState = {
	desk: { title: 'The Front Desk', role: 'Receptionist' },
	records: [
		{ id: 'house-rule', kind: 'notice', title: 'House rule', fields: { text: 'Sign everyone in.' } }
	],
	transcript: [
		{
			seq: 1,
			tick: 1,
			speaker: 'agent',
			speakerName: 'You',
			text: 'Hello, who are you here to see?'
		},
		{ seq: 2, tick: 1, speaker: 'counterpart', speakerName: 'Visitor', text: 'Mr Patel.' }
	],
	queue: [{ id: 'sign-in', title: 'Sign the visitor in', status: 'open', recordIds: ['visitor'] }],
	alerts: [{ id: 'a1', severity: 'warning', text: 'Escalated.', tick: 1 }]
};

const grid: GridWorldState = {
	width: 2,
	height: 2,
	bot: { position: { x: 0, y: 0 } },
	furniture: [],
	containers: [],
	characters: [],
	items: []
};

describe('WorldStage', () => {
	it('draws a desk through DeskView, with its panes, strip and every line', () => {
		render(WorldStage, { world: desk });
		const stage = screen.getByTestId('world-view');
		expect(stage.getAttribute('data-world')).toBe('desk');
		expect(screen.getByTestId('desk-simulation-only').textContent).toContain('FOR SIMULATION ONLY');
		expect(screen.getByTestId('desk-title').textContent).toBe('The Front Desk');
		expect(screen.getByTestId('desk-line-1').textContent).toContain(
			'Hello, who are you here to see?'
		);
		expect(screen.getByTestId('desk-line-2').getAttribute('data-speaker')).toBe('counterpart');
		expect(screen.getByTestId('desk-record-house-rule').textContent).toContain('Sign everyone in.');
		expect(screen.getByTestId('desk-queue-sign-in').getAttribute('data-status')).toBe('open');
		expect(screen.getByTestId('desk-alerts').textContent).toContain('Escalated.');
	});

	it('draws a grid through WorldView, exactly as before', () => {
		render(WorldStage, { world: grid });
		const room = screen.getByTestId('world-view');
		expect(room.getAttribute('data-world')).toBeNull();
		expect(room.getAttribute('role')).toBe('img');
	});

	it('waits with the room copy by default and the desk copy when the host says so', () => {
		const { unmount } = render(WorldStage, { world: undefined });
		expect(screen.getByTestId('world-waiting').textContent).toContain('Playroom');
		unmount();
		render(WorldStage, { world: undefined, view: 'desk' });
		expect(screen.getByTestId('world-waiting').textContent).toContain('open the desk');
	});

	it('shows a world it cannot draw as JSON and says so, never as nothing', () => {
		render(WorldStage, { world: { planet: 'Mars', rovers: 2 } as never });
		const unknown = screen.getByTestId('world-unknown');
		expect(unknown.textContent).toContain('cannot draw');
		expect(unknown.textContent).toContain('Mars');
		expect(screen.queryByTestId('world-view')).toBeNull();
	});
});
