import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * The Lending Desk in the Kit (WP63 stage D, `52-FS-LENDING.md` §4.7): its
 * cards sit behind the Workshop door; a bot built on the clear approve plays
 * as a desk with one application in its queue and the applicant's file to
 * earn.
 */
const CARD = 'card-fs-lending/clear-approve';

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Lending Desk cards stay off the rack until the Workshop door is open, then a bot works the application', async ({
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
	for (const name of ['Application', 'Bureau', 'Affordability worksheet']) {
		await page.getByTestId('brick-controls-perception').getByRole('checkbox', { name }).check();
	}
	await page.getByTestId('socket-mobility').getByRole('button').click();
	for (const name of ['Verify identity', 'Assess affordability', 'Decide', 'Explain decision']) {
		await page.getByTestId('brick-controls-mobility').getByRole('checkbox', { name }).check();
	}
	await page.waitForTimeout(300);
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toHaveAttribute('data-world', 'desk');
	await expect(page.getByTestId('desk-simulation-only')).toBeVisible();
	await expect(page.getByTestId('desk-queue-application')).toBeVisible();
	await expect(page.getByTestId('desk-record-application')).toBeVisible();
});
