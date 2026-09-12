import { expect, test } from '@playwright/test';
import { CALIBRATION } from '@craftabot/pack-fs-bank';
import { skipTutorial } from './support.js';

/**
 * **The bank page's two strips** (WP74 stage C, `66-CALIBRATION.md` §4.4):
 * the calibration table with every row, its source and its review mark;
 * and a population made in the browser from a seed and a size, with its
 * digest and its marginals beside the rows' targets.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

test('the calibration table shows every row with its source, and a population is made from a seed', async ({
	page
}) => {
	await page.goto('/workshop/playground');
	const table = page.getByTestId('playground-calibration');
	await expect(table).toBeVisible();
	await expect(table.locator('tbody tr')).toHaveCount(CALIBRATION.rows.length);
	await expect(table).toContainText('Office for National Statistics');
	await expect(table).toContainText('stated assumption');
	await expect(table).toContainText('2026-09-10');

	await page.getByTestId('playground-population-size').fill('500');
	await page.getByTestId('playground-population-generate').click();
	await expect(page.getByTestId('playground-population-digest')).toBeVisible();
	await expect(page.getByTestId('playground-population-digest')).toContainText(/[0-9a-f]{12}/);
	const marginals = page.getByTestId('playground-marginals');
	await expect(marginals).toBeVisible();
	await expect(marginals).toContainText('age-band');
	await expect(marginals).toContainText('25-34');
	// The same seed and size make the same population: the digest does not move on a second press.
	const first = await page.getByTestId('playground-population-digest').textContent();
	await page.getByTestId('playground-population-generate').click();
	await expect(page.getByTestId('playground-population-digest')).toHaveText(first ?? '');
});
