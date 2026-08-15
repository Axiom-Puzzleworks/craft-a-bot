import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import WorkshopRail from './WorkshopRail.svelte';

/**
 * The rail's job is partly navigation and partly honesty.
 *
 * `17-…` §2 specifies eight screens; one exists. A rail that listed only the
 * built one would misrepresent the product to somebody deciding whether it is
 * worth their time, and one that linked to all eight would be worse — a
 * governance tool whose menu promises rooms that are not there is exactly the
 * kind of thing it exists to stop other software doing.
 */
describe('the Workshop rail', () => {
	it('links to what is built', () => {
		render(WorkshopRail, { props: { current: 'runs' } });
		expect(screen.getByTestId('rail-runs').tagName).toBe('A');
		expect(screen.getByTestId('rail-runs')).toHaveAttribute('aria-current', 'page');
	});

	it('shows what is not built, without pretending it is a link', () => {
		render(WorkshopRail, { props: { current: 'runs' } });
		for (const pending of ['dashboard', 'spec', 'evals', 'policies', 'telemetry', 'export']) {
			expect(screen.getByTestId(`rail-${pending}`).tagName, pending).not.toBe('A');
		}
	});

	it('names the work package each unbuilt screen is waiting on', () => {
		// So the answer to "when?" is in the product rather than only in a doc.
		render(WorkshopRail, { props: { current: 'runs' } });
		expect(screen.getByTestId('rail-policies')).toHaveTextContent('WP22');
		expect(screen.getByTestId('rail-evals')).toHaveTextContent('WP23');
	});

	it('marks only the current screen', () => {
		render(WorkshopRail, { props: { current: 'runs' } });
		const marked = document.querySelectorAll('[aria-current="page"]');
		expect(marked).toHaveLength(1);
	});

	it('always offers the way back to the Kit', () => {
		// `15-…` §1: the flip is the bridge, in both directions.
		render(WorkshopRail, { props: { current: 'runs' } });
		expect(screen.getByText('← The Kit')).toHaveAttribute('href', '/');
	});
});
