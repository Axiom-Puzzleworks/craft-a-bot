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
	 * Scrapbook belongs in this header (`16-…` §1.5) and arrives with slice e,
	 * which builds `/scrapbook/[agentId]`. Until the page exists the button would
	 * be a promise the toy cannot keep, so it is absent rather than dimmed. This
	 * test is the reminder: it should fail, and be deleted, when slice e lands.
	 */
	it('does not yet offer the Scrapbook, because slice e has not built it', () => {
		render(NavHeader, { props: { oninstructions: () => {} } });

		expect(screen.queryByText(/scrapbook/i)).toBeNull();
	});

	it('names the nav for a screen reader arriving at it cold', () => {
		render(NavHeader, { props: { oninstructions: () => {} } });

		expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
	});
});
