import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **Saved views** (WP109, `96-CONTROL-ROOM-V3.md` §2.2): a screen's filter
 * is a URL; saved from the rail under the lens, listed on that lens's rail
 * and no other's, opened from another route with the filter restored,
 * removed with a click. The Run Browser is the reference screen — its
 * filter moved into the URL for this.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

test('a view round-trips through the URL', async ({ page }) => {
	await page.goto('/workshop/runs');
	// Hydrated: the store has been read (the empty state renders only then).
	await expect(page.getByTestId('runs-empty')).toBeVisible();
	await page.getByTestId('filter-text').fill('desk');
	await page.getByTestId('filter-pinned').check();
	await expect(page).toHaveURL(/\/workshop\/runs\?text=desk&pinned=1$/);

	await page.getByTestId('rail-view-save').click();
	await page.getByTestId('rail-view-title').fill('Desk wins');
	await page.getByTestId('rail-view-save-confirm').click();
	const view = page.getByTestId('rail-view-engineer-desk-wins');
	await expect(view).toHaveText('Desk wins');
	await expect(view).toHaveAttribute('aria-current', 'page');

	// From another route, and after a reload: the filter comes back from the URL.
	await page.goto('/workshop/campaigns');
	await page.reload();
	await page.getByTestId('rail-view-engineer-desk-wins').click();
	await expect(page).toHaveURL(/\/workshop\/runs\?text=desk&pinned=1$/);
	await expect(page.getByTestId('filter-pinned')).toBeChecked();
	await expect(page.getByTestId('filter-text')).toHaveValue('desk');

	// Another lens does not see it; the view is the engineer's.
	await page.getByTestId('lens-switcher').selectOption('assurance');
	await expect(page.getByTestId('rail-view-engineer-desk-wins')).toHaveCount(0);
	await expect(page.getByTestId('rail-views-none')).toBeVisible();
	await page.getByTestId('lens-switcher').selectOption('engineer');

	// Clearing the filter clears the URL; removing the view removes it.
	await page.getByTestId('filter-clear').click();
	await expect(page).toHaveURL(/\/workshop\/runs$/);
	await page.getByTestId('rail-view-remove-engineer-desk-wins').click();
	await expect(page.getByTestId('rail-view-engineer-desk-wins')).toHaveCount(0);
});
