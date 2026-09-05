import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * The Advice Desk in the Kit (WP60 stage D, `49-FS-ADVICE.md` §4.8): its
 * cards sit behind the Workshop door like the Front Desk's; a bot built on
 * one plays as a desk, the first-timer speaking first.
 */
const CARD = 'card-fs-advice/advise-inheritance';

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Advice Desk cards stay off the rack until the Workshop door is open, then a bot plays the desk', async ({
	page
}) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('card-snack')).toBeVisible();
	await expect(page.getByTestId(CARD)).toHaveCount(0);

	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await buildReadyBot(page, CARD);
	await page.getByTestId('socket-perception').getByRole('button').click();
	for (const name of ['Conversation', 'Customer record', 'Product shelf']) {
		await page.getByTestId('brick-controls-perception').getByRole('checkbox', { name }).check();
	}
	await page.getByTestId('socket-mobility').getByRole('button').click();
	for (const name of [
		'Say',
		'Ask a suitability question',
		'Recommend a product',
		'Refer to an adviser'
	]) {
		await page.getByTestId('brick-controls-mobility').getByRole('checkbox', { name }).check();
	}
	await page.waitForTimeout(300);
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toHaveAttribute('data-world', 'desk');
	await expect(page.getByTestId('desk-simulation-only')).toBeVisible();
	// The first-timer speaks first, about the money in their current account.
	await expect(page.getByTestId('desk-line-1')).toHaveAttribute('data-speaker', 'counterpart');
	await expect(page.getByTestId('desk-line-1')).toContainText('current account');
	await expect(page.getByTestId('desk-record-desk-brief')).toBeVisible();
});
