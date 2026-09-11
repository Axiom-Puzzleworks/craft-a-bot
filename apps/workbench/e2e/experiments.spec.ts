import { expect, test, type Page } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **Experiments** (WP89, `72-EXPERIMENTS.md` §6; `64-…` §6.8.1): the page
 * says no experiment has run; a two-configuration design over a small
 * lending book shows as the file it is and expands to two campaigns; run,
 * both campaigns land on the runner and the result folds — the verdict
 * Lamp, a Matrix per metric with a row per treatment level, the note with
 * the minimum detectable effect, every run behind it opening the Run Lab;
 * the result is listed and reopens after a reload.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function openTheWorkshopDoor(page: Page): Promise<void> {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

test('a design over the lending book runs as two campaigns and folds into a result with a Matrix per metric', async ({
	page
}) => {
	test.setTimeout(240_000);
	await openTheWorkshopDoor(page);
	await page.goto('/workshop/experiments');
	await expect(page.getByTestId('experiments-page')).toBeVisible();
	await expect(page.getByTestId('experiments-empty')).toBeVisible();
	// Two configurations of the lending journey, a small book, two metrics.
	await page.getByTestId('experiment-level-rules-only').check();
	await page.getByTestId('experiment-level-bot-everywhere').check();
	await page.getByTestId('experiment-size').fill('30');
	await page.getByTestId('experiment-hypothesis').fill('Level 5 changes the success rate.');
	await expect(page.getByTestId('experiment-expansion')).toHaveText('2 campaigns, sharing seeds');
	await expect(page.getByTestId('experiment-design')).toContainText('"axis": "executors"');
	await expect(page.getByTestId('experiment-design')).toContainText(
		'"hypothesis": "Level 5 changes the success rate."'
	);
	await page.getByTestId('run-experiment').click();
	await expect(page.getByTestId('experiment-note')).toContainText('2 campaigns queued');
	await expect(page.getByTestId('experiment-result')).toBeVisible({ timeout: 180_000 });
	await expect(page.getByTestId('experiment-verdict')).toBeVisible();
	await expect(page.getByTestId('experiment-effects-value')).toHaveText('2');
	await expect(page.getByTestId('experiment-result-metric-success')).toBeVisible();
	await expect(page.getByTestId('experiment-matrix-success').locator('tbody tr')).toHaveCount(1);
	await expect(page.getByTestId('experiment-matrix-success')).toContainText(
		'bot-everywhere vs rules-only'
	);
	await expect(page.getByTestId('experiment-matrix-tokens')).toBeVisible();
	await expect(page.getByTestId('experiment-result-note')).toContainText(
		'minimum detectable difference'
	);
	// Every run behind the result opens the Run Lab.
	await page.getByText('Every run behind this result').click();
	const first = page.getByTestId('experiment-run-list').locator('a').first();
	await expect(first).toBeVisible();
	await first.click();
	await expect(page).toHaveURL(/\/workshop\/runs\/[^/]+$/);
	// The result is stored and reopens.
	await page.goto('/workshop/experiments');
	await expect(page.getByTestId('experiment-result-picker')).toBeVisible();
	await expect(page.getByTestId('experiment-result')).toBeVisible();
	await expect(page.getByTestId('experiment-hypothesis-line')).toContainText('Level 5 changes');
});
