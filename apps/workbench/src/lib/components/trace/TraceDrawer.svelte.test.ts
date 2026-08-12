import type { EngineEvent } from '@craftabot/core';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TraceDrawer from './TraceDrawer.svelte';

/**
 * WP6's third definition-of-done clause: **a 10,000-event trace scrolls
 * smoothly**. "Smoothly" is not directly assertable, but the thing that makes
 * it true is: the DOM only ever holds a small window of rows.
 */

const RUN_ID = '22222222-2222-4222-8222-222222222222';

function uuid(n: number): string {
	return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function synthesise(count: number): EngineEvent[] {
	return Array.from({ length: count }, (_value, index) => ({
		id: uuid(index + 1),
		runId: RUN_ID,
		tick: Math.floor(index / 10),
		timestamp: '2026-08-12T10:00:00Z',
		type: 'tick.started' as const,
		payload: {}
	}));
}

const promptEvent: EngineEvent = {
	id: uuid(900_000),
	runId: RUN_ID,
	tick: 1,
	timestamp: '2026-08-12T10:00:01Z',
	type: 'prompt.composed',
	payload: {
		estimatedTokens: 128,
		messages: [
			{ role: 'system', content: 'You are a small robot in a simulated playroom.' },
			{ role: 'user', content: 'What you remember of earlier turns, oldest first:\nTick 1: …' },
			{ role: 'user', content: 'Right now:\nYou look around: nothing but rug.' }
		]
	}
};

describe('the Flight Recorder at ten thousand events', () => {
	it('keeps only a small window of rows in the DOM', () => {
		render(TraceDrawer, {
			props: { events: synthesise(10_000), rowHeight: 28, viewportHeight: 280 }
		});

		expect(screen.getByTestId('trace-count')).toHaveTextContent('10000 events');
		const rows = screen.getAllByTestId('trace-row');
		expect(rows.length).toBeLessThan(40);
		expect(rows.length).toBeGreaterThan(0);
	});

	it('sizes the scroll area for the whole list, so the scrollbar is honest', () => {
		const { container } = render(TraceDrawer, {
			props: { events: synthesise(10_000), rowHeight: 28, viewportHeight: 280 }
		});
		const sizer = container.querySelector('.sizer');
		expect(sizer?.getAttribute('style')).toContain('280000px');
	});

	it('renders a different window once scrolled', async () => {
		const { container } = render(TraceDrawer, {
			props: { events: synthesise(10_000), rowHeight: 28, viewportHeight: 280 }
		});

		const firstRowBefore = screen.getAllByTestId('trace-row')[0]?.textContent;
		const viewport = container.querySelector('.viewport');
		if (!viewport) throw new Error('no viewport');

		viewport.scrollTop = 5000 * 28;
		viewport.dispatchEvent(new Event('scroll'));
		await Promise.resolve();

		const rows = screen.getAllByTestId('trace-row');
		expect(rows.length).toBeLessThan(40);
		expect(rows[0]?.textContent).not.toBe(firstRowBefore);
	});
});

describe('the trace rows', () => {
	it('colour-codes by lane and names the lane in words too', () => {
		render(TraceDrawer, { props: { events: [promptEvent], rowHeight: 28, viewportHeight: 280 } });
		const row = screen.getByTestId('trace-row');

		expect(row.className).toContain('row--think');
		// Colour never alone: the lane and the plain-language label are both there.
		expect(row).toHaveTextContent('think');
		expect(row).toHaveTextContent('Prompt composed');
	});

	it('starts with nothing selected', () => {
		render(TraceDrawer, { props: { events: [promptEvent], rowHeight: 28, viewportHeight: 280 } });
		expect(screen.getByTestId('payload-empty')).toBeInTheDocument();
	});
});
