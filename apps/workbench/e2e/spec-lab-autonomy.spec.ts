import { expect, test } from '@playwright/test';
import { BRICKS, buildReadyBot, skipTutorial } from './support.js';

/**
 * **The autonomy dial** (`40-DEBTS.md` §4.1, WP52; `14-…` §4.6's "future
 * Workshop work"): the Spec Lab picks a preset and reads back the concrete
 * `approval` and budgets the Safety Brick now carries — from the spec,
 * which the JSON below it also shows.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('picking an autonomy preset writes approval and budgets into the fitted Safety Brick', async ({
	page
}) => {
	const agentId = await buildReadyBot(page, 'card-snack');

	// No Safety Brick yet: the dial says so and cannot be applied.
	await page.goto(`/workshop/spec/${agentId}`);
	await expect(page.getByTestId('autonomy-unfitted')).toBeVisible();
	await expect(page.getByTestId('apply-autonomy')).toBeDisabled();

	// Fit one from the Spec Lab's own safety stack.
	await page.getByTestId('safety-kind-select').selectOption(BRICKS.safety.id);
	await page.getByTestId('fit-safety-brick').click();
	await expect(page.getByTestId('safety-stack-0')).toContainText(BRICKS.safety.id);
	await expect(page.getByTestId('autonomy-readback')).toContainText('No level recorded');
	await expect(page.getByTestId('autonomy-readback')).toContainText('approval off');

	await page.getByTestId('autonomy-select').selectOption('approver');
	await page.getByTestId('apply-autonomy').click();
	await expect(page.getByTestId('autonomy-readback')).toContainText('Level approver');
	await expect(page.getByTestId('autonomy-readback')).toContainText('approval risky');
	await expect(page.getByTestId('autonomy-readback')).toContainText('max turns 60');
	await expect(page.getByTestId('autonomy-readback')).toContainText('max tokens 100000');

	// The spec itself carries the values — the readback reads the spec, not the preset.
	await expect(page.getByTestId('spec-json')).toContainText('"autonomy": "approver"');
	await expect(page.getByTestId('spec-json')).toContainText('"approval": "risky"');
	await expect(page.getByTestId('spec-json')).toContainText('"maxTicks": 60');

	// And it survives a reload: it was persisted, not kept on the page.
	await page.reload();
	await expect(page.getByTestId('autonomy-readback')).toContainText('Level approver');
});
