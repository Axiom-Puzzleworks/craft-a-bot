import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NavHeader from './NavHeader.svelte';

/**
 * **The header that makes Settings reachable** (`16-…` §1.5, `12-…` D16).
 *
 * The defect was not that Settings looked wrong — it was that a child on the
 * Shelf had no way to get there at all, so the sound could only be turned off
 * by someone who already knew to open a bot first.
 */
describe('NavHeader', () => {
	it('offers the Shelf and Settings as links a child can follow from anywhere', () => {
		render(NavHeader, { props: { oninstructions: () => {} } });

		expect(screen.getByTestId('nav-shelf')).toHaveAttribute('href', '/');
		expect(screen.getByTestId('nav-settings')).toHaveAttribute('href', '/settings');
	});

	/**
	 * Instructions is a button, not a link, because the leaflet is an overlay the
	 * layout owns — it spans the bench and the Playroom, and navigating to it
	 * would be the one thing guaranteed to lose a reader's place.
	 */
	it('asks the layout to open the leaflet rather than navigating to it', async () => {
		const oninstructions = vi.fn();
		render(NavHeader, { props: { oninstructions } });

		await fireEvent.click(screen.getByTestId('nav-instructions'));

		expect(oninstructions).toHaveBeenCalledOnce();
		expect(screen.getByTestId('nav-instructions').tagName).toBe('BUTTON');
	});

	it('marks the screen you are on, and only that one', () => {
		render(NavHeader, { props: { current: 'settings', oninstructions: () => {} } });

		expect(screen.getByTestId('nav-settings')).toHaveAttribute('aria-current', 'page');
		expect(screen.getByTestId('nav-shelf')).not.toHaveAttribute('aria-current');
	});

	/**
	 * On the bench and in the Playroom nothing is current: you got there through
	 * a bot, not through the nav, and marking Shelf would claim a link is the
	 * current page when the current page has no link at all.
	 */
	it('marks nothing when the screen is not one the header links to', () => {
		render(NavHeader, { props: { oninstructions: () => {} } });

		expect(screen.getByTestId('nav-shelf')).not.toHaveAttribute('aria-current');
		expect(screen.getByTestId('nav-settings')).not.toHaveAttribute('aria-current');
	});

	/**
	 * Slice c left this header without a Scrapbook and a test pinning its
	 * absence, on the grounds that a dimmed button going nowhere is a worse
	 * promise to a five-year-old than a header that grows. Slice e built the
	 * page, so the promise is kept and the reminder is now the assertion.
	 */
	it('offers the Scrapbook, now that there is one', () => {
		render(NavHeader, { props: { oninstructions: () => {} } });

		expect(screen.getByTestId('nav-scrapbook')).toHaveAttribute('href', '/scrapbook');
	});

	it('names the nav for a screen reader arriving at it cold', () => {
		render(NavHeader, { props: { oninstructions: () => {} } });

		expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
	});
});
