import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * The Fraud Desk in the Kit (WP62 stage D, `51-FS-FRAUD.md` §4.7): its
 * cards sit behind the Workshop door; a bot built on the mixed queue plays
 * as a desk with five alerts in its queue and nobody on the line.
 */
const CARD = 'card-fs-fraud/queue-mixed';

test.beforeEach(async ({ page }) => skipTutorial(page));

test('the Fraud Desk cards stay off the rack until the Workshop door is open, then a bot works the queue', async ({
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
	for (const name of ['Queue', 'Alert detail', 'Customer history']) {
		await page.getByTestId('brick-controls-perception').getByRole('checkbox', { name }).check();
	}
	await page.getByTestId('socket-mobility').getByRole('button').click();
	for (const name of ['Open alert', 'Look up', 'Hold', 'Release', 'Escalate']) {
		await page.getByTestId('brick-controls-mobility').getByRole('checkbox', { name }).check();
	}
	await page.waitForTimeout(300);
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);

	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toHaveAttribute('data-world', 'desk');
	await expect(page.getByTestId('desk-simulation-only')).toBeVisible();
	await expect(page.getByTestId('desk-queue-alert-1')).toBeVisible();
	await expect(page.getByTestId('desk-queue-alert-5')).toBeVisible();
	await expect(page.getByTestId('desk-record-alert-1')).toBeVisible();
});
