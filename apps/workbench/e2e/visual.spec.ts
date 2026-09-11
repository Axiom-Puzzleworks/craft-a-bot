import { expect, test } from '@playwright/test';
import {
	awaitRunSaved,
	buildDeskBotAndGo,
	buildReadyBot,
	pinScrollbars,
	settle,
	skipTutorial
} from './support.js';

/**
 * **The visual-regression set** (WP57 stage C, `44-…` §4.6): the first
 * screenshots — the Kit's shelf and bench, the Front Desk at play, the Spec
 * Lab with its Boundary, the Run Lab with its Boundary. A separate
 * Playwright project (`npm run e2e:visual`), snapshots committed per
 * platform; the diff in CI is WP71's, when Linux baselines exist.
 *
 * Every screen is settled before the shot: no live run, no animation in
 * flight, reduced motion on.
 */
test.use({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
test.beforeEach(async ({ page }) => {
	await skipTutorial(page);
	await pinScrollbars(page);
});

async function openTheWorkshopDoor(page: import('@playwright/test').Page) {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

test('the Kit: shelf and bench', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByTestId('agent-list')).toBeVisible();
	await expect(page).toHaveScreenshot('kit-shelf.png', { fullPage: true });

	await buildReadyBot(page, 'card-snack');
	await expect(page.getByRole('button', { name: /GO/ })).toBeEnabled();
	await expect(page).toHaveScreenshot('kit-bench.png', { fullPage: true });
});

test('the Front Desk at play', async ({ page }) => {
	await buildDeskBotAndGo(page);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('desk-line-1')).toBeVisible();
	await expect(page.getByTestId('world-view')).toHaveScreenshot('desk-play.png');
});

test('the Spec Lab and the Run Lab with a Boundary', async ({ page }) => {
	await openTheWorkshopDoor(page);
	// A name on the trace (WP65), so the Run Lab's "started by" reads the same in every shot — the id alone is minted fresh per browser.
	await page.getByTestId('display-name').fill('Sam');
	await page.getByTestId('display-name').press('Enter');
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/workshop/spec/${agentId}`);
	await expect(page.getByTestId('spec-boundary')).toBeVisible();
	await expect(page).toHaveScreenshot('workshop-spec-lab.png', { fullPage: true });

	await page.goto(`/bench/${agentId}`);
	await page.getByRole('button', { name: /GO/ }).click();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);
	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
	await page.goto(`/workshop/runs/${runId}`);
	await expect(page.getByTestId('run-boundary')).toBeVisible();
	// WP65: the run names who started it — the browser's principal, by id here since no name was set.
	await expect(page.getByTestId('run-principal')).toBeVisible();
	await expect(page).toHaveScreenshot('workshop-run-lab.png', { fullPage: true });

	// WP66 (`54-…` §5): the same screen with a decision explained and its related rows lit.
	await page
		.locator('[data-testid^="row-"] .type', { hasText: /^decision$/ })
		.first()
		.click();
	await page.getByTestId('show-explain').check();
	await expect(page.getByTestId('explain')).toBeVisible();
	await expect(page).toHaveScreenshot('workshop-run-lab-explain.png', { fullPage: true });
});

// WP67 (`53-…` §5): the assurance pack, filed for a bot with one run — the first Workshop screen a reviewer reads.
test('the assurance pack', async ({ page }) => {
	await openTheWorkshopDoor(page);
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/workshop/assurance?agent=${agentId}`);
	await expect(page.getByTestId('assurance-control-table')).toBeVisible();
	await settle(page);
	await expect(page).toHaveScreenshot('workshop-assurance.png', { fullPage: true });
});
