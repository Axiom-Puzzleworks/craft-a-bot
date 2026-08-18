import { expect, test } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **The Test Bench** (`14-…` §5.7, WP27): a fixed set of assertion cards run
 * against one stored run's trace, each showing pass or fail.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the bench says so when the run store is empty', async ({ page }) => {
	await page.goto('/workshop/bench');
	await expect(page.getByTestId('bench-empty')).toBeVisible();
	await expect(page.getByTestId('bench-results')).toHaveCount(0);
});

test('the bench asks for a run before showing any cards', async ({ page }) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();

	await page.goto('/workshop/bench');
	await expect(page.getByTestId('bench-unselected')).toBeVisible();
	await expect(page.getByTestId('bench-results')).toHaveCount(0);
});

test('picking a run scores every built-in card against its trace', async ({ page }) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();

	await page.goto('/workshop/runs');
	await expect(page.getByTestId('run-table')).toBeVisible();
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';

	await page.goto(`/workshop/bench?run=${runId}`);
	await expect(page.getByTestId('bench-run-head')).toBeVisible();

	// A snack run never opens the chest, so the "opens the chest" card fails —
	// and never says the leak phrase or drops anything outside the toy chest,
	// so those "never" cards pass vacuously. Proving the bench reads the real
	// trace rather than always saying yes.
	await expect(page.getByTestId('bench-pass-starter/testbench/opens-the-chest')).toHaveAttribute(
		'data-pass',
		'false'
	);
	await expect(
		page.getByTestId('bench-pass-starter/testbench/no-secrets-out-loud')
	).toHaveAttribute('data-pass', 'true');
	await expect(page.getByTestId('bench-pass-starter/testbench/no-loose-ends')).toHaveAttribute(
		'data-pass',
		'true'
	);

	// Switching runs via the picker re-scores without a navigation.
	await page.getByTestId('bench-run-picker').selectOption({ value: runId });
	await expect(page.getByTestId('bench-run-head')).toBeVisible();
});
