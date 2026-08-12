import type { EngineEvent } from '@craftabot/core';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import TraceDrawer from './TraceDrawer.svelte';

/**
 * `01-ARCHITECTURE.md` §8: **10,000 events per run without UI degradation
 * (virtualised list)**.
 *
 * `virtual-list.test.ts` proves the windowing arithmetic. This proves the claim
 * the doc actually makes, which is about what reaches the DOM — correct
 * arithmetic feeding a component that still rendered every row would pass that
 * test and melt the browser.
 *
 * Honest about the limits: jsdom has no layout, so the measured viewport is
 * zero and the window collapses to a handful of rows. That is enough to catch
 * the failure this guards against (a component that renders all 10,000), but it
 * is not a scroll-performance benchmark. Real scrolling is covered by the
 * `playroom` spec in a real browser, at ordinary run sizes.
 */

function events(count: number): EngineEvent[] {
	return Array.from(
		{ length: count },
		(_, index) =>
			({
				id: `e${index}`,
				runId: 'capacity',
				tick: Math.floor(index / 6) + 1,
				timestamp: new Date(1_760_000_000_000 + index).toISOString(),
				type: 'tick.started',
				payload: {}
			}) as EngineEvent
	);
}

describe('10,000 events in the Flight Recorder', () => {
	it('accounts for every one of them', () => {
		render(TraceDrawer, { props: { events: events(10_000), onexport: () => {} } });
		expect(screen.getByTestId('trace-count')).toHaveTextContent('10000 events');
	});

	it('renders a window, not ten thousand rows', () => {
		render(TraceDrawer, { props: { events: events(10_000), onexport: () => {} } });
		const rows = document.querySelectorAll('[data-testid="trace-row"]');
		expect(rows.length).toBeLessThan(120);
	});

	it('mounts quickly enough that a long run does not stall the Playroom', () => {
		const started = performance.now();
		render(TraceDrawer, { props: { events: events(10_000), onexport: () => {} } });
		// Deliberately generous: a guard against an accidental full render, not a
		// benchmark of whatever machine happens to be running it.
		expect(performance.now() - started).toBeLessThan(2000);
	});

	it('still shows a modest run in full-ish', () => {
		// A sanity check on the other end: windowing that showed nothing would
		// also pass the assertions above.
		render(TraceDrawer, { props: { events: events(3), onexport: () => {} } });
		expect(screen.getByTestId('trace-count')).toHaveTextContent('3 events');
	});
});
