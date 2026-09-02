import { expect, test } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **Evaluators** (`31-EVALUATORS.md` §4.3, WP43): an evaluator runs over a
 * stored run from the Evaluators page, its verdict persists, and the Run
 * Lab's Evaluations inspector shows it.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('runs a card over a stored run and finds the verdict in the Run Lab', async ({ page }) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();

	await page.goto('/workshop/runs');
	await expect(page.getByTestId('run-table')).toBeVisible();
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';

	await page.goto(`/workshop/evaluators?run=${runId}`);
	await expect(page.getByTestId('evaluator-list')).toBeVisible();
	await expect(page.getByTestId('evaluator-evals/judge/rubric')).toBeVisible();
	await expect(page.getByTestId('evaluations-empty')).toBeVisible();

	// A snack run never opens the chest: the card fails, and says so.
	await page.getByTestId('run-evaluator-starter/testbench/opens-the-chest').click();
	const record = page.getByTestId('evaluation-starter/testbench/opens-the-chest');
	await expect(record).toBeVisible();
	await expect(record).toHaveAttribute('data-verdict', 'fail');

	// The judge, with no battery in, is inconclusive — never a pass.
	await page.getByTestId('run-evaluator-evals/judge/rubric').click();
	await expect(page.getByTestId('evaluation-evals/judge/rubric')).toHaveAttribute(
		'data-verdict',
		'inconclusive'
	);

	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('run-header')).toBeVisible();
	await expect(page.getByTestId('evaluations')).toBeVisible();
	await expect(page.getByTestId('evaluations')).toContainText('opens-the-chest');
	await expect(page.getByTestId('evaluations')).toContainText('fail');
});
