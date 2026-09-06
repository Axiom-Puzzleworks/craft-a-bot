import { expect, test } from '@playwright/test';
import { clientGoto, openShelf, playToTheEnd, skipTutorial } from './support.js';

/**
 * **The Workshop** (`59-EDITIONS.md` §4.5, §11 items 3–5, WP69): under
 * `/workshop/`, the door starts open, a run played in the Kit opens in the
 * Run Lab, the Playground's box on the shelf links to its section, and the
 * Playground's own route is not in this box.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

test('the door starts open and a run opens in the Run Lab under /workshop/', async ({ page }) => {
	await openShelf(page, 'workshop');
	// The door is open by default in a Workshop box (`59-…` §2 item 7).
	await expect(page.getByTestId('nav-workshop')).toBeVisible();

	await playToTheEnd(page);
	await page.goto('');
	await page.getByTestId('nav-workshop').click();
	await expect(page.getByTestId('workshop')).toBeVisible();
	await expect(page).toHaveURL(/\/workshop\/workshop$/);

	await clientGoto(page, 'workshop', '/workshop/runs');
	const row = page.getByTestId(/^run-row-/).first();
	await expect(row).toBeVisible();
	const runId = ((await row.getAttribute('data-testid')) ?? '').replace('run-row-', '');
	await clientGoto(page, 'workshop', `/workshop/runs/${runId}`);
	await expect(page.getByTestId('header-outcome')).toContainText('SUCCESS');
});

test('the shelf sends the Playground box to its section, and the Playground route is not in this box', async ({
	page
}) => {
	await openShelf(page, 'workshop');
	await expect(page.getByTestId('pack-link-retail-bank-playground')).toHaveAttribute(
		'href',
		'/playground/'
	);
	await clientGoto(page, 'workshop', '/workshop/playground/advice');
	await expect(page.getByTestId('not-in-this-box')).toBeVisible();
	await expect(page.getByTestId('not-in-this-box-section')).toHaveAttribute('href', '/playground/');
	// The rest of the Workshop is in the box.
	await clientGoto(page, 'workshop', '/workshop/evidence');
	await expect(page.getByTestId('evidence-page')).toBeVisible();
});
