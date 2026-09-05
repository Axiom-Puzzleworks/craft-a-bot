import { expect, test } from '@playwright/test';
import { awaitRunSaved, buildDeskBotAndGo, DESK_CARD, skipTutorial } from './support.js';

/**
 * A Desk on every screen that shows a world (WP53 stage A, `43-…` §10): the
 * Front Desk's card is behind the Workshop door; with the door open a bot
 * built on it plays in the Kit's Playroom slot through `WorldStage`, and the
 * stored run opens in the Run Lab and the replay with the same transcript.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function openTheWorkshopDoor(page: import('@playwright/test').Page) {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

test('the Front Desk card stays off the rack until the Workshop door is open', async ({ page }) => {
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId('card-snack')).toBeVisible();
	await expect(page.getByTestId(DESK_CARD)).toHaveCount(0);

	await openTheWorkshopDoor(page);
	await page.goto('/');
	await page.getByTestId('new-bot').click();
	await expect(page.getByTestId(DESK_CARD)).toBeVisible();
});

test('a bot on the Front Desk plays as a desk, and the stored run replays as one', async ({
	page
}) => {
	await buildDeskBotAndGo(page);

	// Before the first frame the stage says which world is coming.
	await expect(page.getByTestId('world-waiting')).toContainText('open the desk');

	await page.getByTestId('step').click();
	const stage = page.getByTestId('world-view');
	await expect(stage).toHaveAttribute('data-world', 'desk');
	await expect(page.getByTestId('desk-simulation-only')).toBeVisible();
	await expect(page.getByTestId('desk-line-1')).toHaveAttribute('data-speaker', 'agent');
	await expect(page.getByTestId('desk-line-1')).toContainText('who');

	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('end-card')).toHaveAttribute('data-outcome', 'SUCCESS');
	await expect(page.getByTestId('desk-queue-sign-in')).toHaveAttribute('data-status', 'decided');
	await expect(page.getByTestId('desk-record-visitor')).toBeVisible();
	await awaitRunSaved(page);

	// The Run Lab: the same trace, the same desk, scrubbed.
	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('world-view')).toHaveAttribute('data-world', 'desk');
	await expect(page.getByTestId('desk-line-1')).toBeVisible();

	// The Kit's replay: the same again.
	await page.goto(`/replay/${runId}`);
	await expect(page.getByTestId('world-view')).toHaveAttribute('data-world', 'desk');
	await expect(page.getByTestId('desk-transcript')).toContainText('who');
});
