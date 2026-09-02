import { expect, test } from '@playwright/test';
import { skipTutorial } from './support.js';

/**
 * **The Guard Brick on the bench** (`29-GUARD-SHELL.md` §10 stage E): a
 * Workshop-only kind — invisible with the door shut, in the tray with it
 * open — whose panel picks a registered guardrail service (Model Armor, the
 * only one until WP42) and draws the shell's screening dials as a nested
 * block through the schema panel's `object` case.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('is not offered with the Workshop door shut', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('parts-tray')).toBeVisible();
	await expect(page.getByTestId('tray-workshop/guard')).toHaveCount(0);
});

test('with the door open it fits the safety socket, lists Model Armor, and shows the screens', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();

	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('tray-workshop/guard')).toBeVisible();

	await page.getByTestId('tray-workshop/guard').focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes('safety socket — this one fits')) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');

	await page.getByTestId('socket-safety').getByRole('button').click();
	const controls = page.getByTestId('brick-controls-safety');
	await expect(controls).toBeVisible();

	const picker = controls.getByTestId('choice-serviceId');
	await expect(picker).toBeVisible();
	await expect(picker.locator('option', { hasText: 'Model Armor' })).toHaveCount(1);
	await picker.selectOption({ label: 'Model Armor' });
	await expect(picker).toHaveValue('geap/model-armor');

	await expect(controls.getByTestId('fields-screening')).toBeVisible();
	await expect(controls.getByTestId('choice-screening.screenDecision')).toHaveValue('ask');
	await controls.getByTestId('choice-screening.screenDecision').selectOption('stop');
	await expect(controls.getByTestId('choice-screening.screenDecision')).toHaveValue('stop');
});
