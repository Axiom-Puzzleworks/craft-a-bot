import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import WorkshopRail from './WorkshopRail.svelte';

/**
 * The rail's job is partly navigation and partly honesty.
 *
 * `17-…` §2's information architecture grew from one built screen to every
 * one of them, across WP20–WP34. A rail that listed only the built ones
 * would have misrepresented the product to somebody deciding whether it was
 * worth their time; now that every screen exists, `spec` is the one entry
 * that stays a non-link on purpose, not because it is unbuilt.
 */
describe('the Workshop rail', () => {
	it.each([
		'dashboard',
		'runs',
		'evals',
		'policies',
		'bench',
		'telemetry',
		'incidents',
		'safety-case',
		'export'
	])('links to %s, which is built', (built) => {
		render(WorkshopRail, { props: { current: 'runs' } });
		expect(screen.getByTestId(`rail-${built}`).tagName).toBe('A');
	});

	it('marks the current screen', () => {
		render(WorkshopRail, { props: { current: 'runs' } });
		expect(screen.getByTestId('rail-runs')).toHaveAttribute('aria-current', 'page');
	});

	it('shows the Spec Lab as a pointer, not a link — it is always about a particular bot', () => {
		render(WorkshopRail, { props: { current: 'runs' } });
		expect(screen.getByTestId('rail-spec').tagName).not.toBe('A');
		expect(screen.getByTestId('rail-spec')).toHaveTextContent('per bot');
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
