import { expect, test } from '@playwright/test';
import { clientGoto, openShelf, skipTutorial } from './support.js';

/**
 * **The Playground** (`59-EDITIONS.md` §4.5, §11 item 3, WP69): under
 * `/playground/`, the Advice Desk generates a case from a seed, the
 * Playground's box reads Unlocked! on the shelf, and every route is in
 * the box.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Advice Desk generates a case under /playground/, and the whole site is in this box', async ({
	page
}) => {
	await openShelf(page, 'playground');
	await expect(page.getByTestId('pack-retail-bank-playground')).toContainText('Unlocked!');
	await expect(page.getByTestId('pack-link-retail-bank-playground')).toHaveCount(0);
	await expect(page.getByTestId('nav-workshop')).toBeVisible();

	await clientGoto(page, 'playground', '/workshop/playground');
	await expect(page.getByTestId('playground-simulation-only')).toBeVisible();
	await page.getByTestId('playground-advice-link').click();
	await expect(page).toHaveURL(/\/playground\/workshop\/playground\/advice$/);
	await page.getByTestId('advice-generate').click();
	await expect(page.getByTestId('advice-cards').locator('li')).toHaveCount(7);

	await clientGoto(page, 'playground', '/workshop/runs');
	await expect(page.getByTestId('not-in-this-box')).toHaveCount(0);
	await page.goto('settings');
	await expect(page.getByText('Show the Workshop')).toBeVisible();
});
