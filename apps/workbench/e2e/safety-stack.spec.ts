import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **Socket capacity** (WP40, `26-TARGET-DESIGN-V3.md` §6.13): the Spec Lab
 * fits a second safety brick into the one socket that holds a stack; the
 * Kit's bench keeps its one well and shows the rest as a chip that points
 * at the Workshop.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('a stack fitted in the Spec Lab reads on the Kit bench as one brick and a chip', async ({
	page
}) => {
	const agentId = await buildReadyBot(page);

	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();

	await page.goto(`/workshop/spec/${agentId}`);
	await expect(page.getByTestId('safety-stack')).toBeVisible();
	await expect(page.getByTestId('no-safety-bricks')).toBeVisible();

	await page.getByTestId('safety-kind-select').selectOption('starter/safety');
	await page.getByTestId('fit-safety-brick').click();
	await expect(page.getByTestId('safety-stack-0')).toContainText('starter/safety');

	await page.getByTestId('safety-kind-select').selectOption('workshop/guard');
	await page.getByTestId('fit-safety-brick').click();
	await expect(page.getByTestId('safety-stack-1')).toContainText('workshop/guard');
	await expect(page.getByTestId('stack-capacity')).toContainText('2 of 4');
	// Two bricks in one socket is no longer a build problem.
	await expect(page.getByTestId('spec-problems')).not.toContainText('socket');

	await page.goto(`/bench/${agentId}`);
	await expect(page.getByTestId('socket-safety')).toHaveAttribute('data-fitted', 'true');
	await expect(page.getByTestId('stack-safety')).toHaveText('+1 more, see Workshop');
	await page.getByTestId('socket-safety').getByRole('button').click();
	await expect(page.getByTestId('brick-controls-safety')).toBeVisible();

	// Taking the bench's brick off leaves the rest of the stack where it was.
	await page.getByTestId('socket-safety').getByRole('button').focus();
	await page.keyboard.press('Delete');
	await expect(page.getByTestId('stack-safety')).toHaveCount(0);
	await expect(page.getByTestId('socket-safety')).toHaveAttribute('data-fitted', 'true');
});
