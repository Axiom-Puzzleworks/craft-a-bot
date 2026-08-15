import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **WP23's definition of done, as a test**: "matrix run configured, executed,
 * drilled to a single trace without leaving the Workshop".
 *
 * One walk, because that is what the DoD is — a journey, not three features.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a matrix is configured, run, and drilled down to one trace', async ({ page }) => {
	await page.goto('/workshop/evals');

	// Configure: one card, both scripted brains, two seeds.
	await page.getByTestId('card-snack').uncheck();
	await page.getByTestId('seed-count').fill('2');
	await expect(page.getByTestId('matrix-size')).toHaveText('4 cells');

	// Execute.
	await page.getByTestId('run-matrix').click();
	await expect(page.getByTestId('success-grid')).toBeVisible({ timeout: 30_000 });

	// The optimal row is the solvability floor and should be a clean sweep.
	await expect(page.getByTestId('square-say-hello-scripted-optimal')).toHaveText('100%');
	await expect(page.getByTestId('scorecard')).toBeVisible();

	// Drill: square → the runs behind it → one run in the Run Lab.
	await page.getByTestId('square-say-hello-scripted-noisy').click();
	await expect(page.getByTestId('square-runs')).toBeVisible();
	await page.getByTestId('open-cell-1').click();

	await expect(page.getByTestId('run-header')).toBeVisible();
	await expect(page.getByTestId('timeline')).toBeVisible();
	// It is the eval's run, named for its cell.
	await expect(page.getByTestId('run-header')).toContainText('scripted-noisy');
});

test('two cells of one matrix are two different runs', async ({ page }) => {
	/*
	 * The bug this screen found in WP19's runner: the harness numbers each run's
	 * ids from a fixed point, so every cell carried the same `runId`. The report's
	 * join key joined everything to everything, and storing a second cell's trace
	 * appended it to the first.
	 */
	const openSeed = async (seed: number): Promise<string> => {
		/*
		 * A fresh visit each time rather than `goBack()`: the report lives in the
		 * page's memory, so leaving the screen loses it. That is a real limitation
		 * of this version and not what this test is about.
		 */
		await page.goto('/workshop/evals');
		await page.getByTestId('card-snack').uncheck();
		await page.getByTestId('seed-count').fill('2');
		await page.getByTestId('run-matrix').click();
		await expect(page.getByTestId('success-grid')).toBeVisible({ timeout: 30_000 });

		await page.getByTestId('square-say-hello-scripted-noisy').click();
		await page.getByTestId(`open-cell-${seed}`).click();
		await expect(page.getByTestId('run-header')).toBeVisible();
		return new URL(page.url()).pathname;
	};

	expect(await openSeed(2)).not.toBe(await openSeed(1));
});
