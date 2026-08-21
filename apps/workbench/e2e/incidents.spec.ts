import { expect, test } from '@playwright/test';
import { BRICKS, buildAndGo, buildReadyBot, skipTutorial } from './support.js';

/**
 * **The incident log** (`19-…` #31, WP34 stage B): derived, not authored —
 * a stored run appears here only if its own trace actually went wrong.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('says so when the run store is empty', async ({ page }) => {
	await page.goto('/workshop/incidents');
	await expect(page.getByTestId('incidents-no-runs')).toBeVisible();
	await expect(page.getByTestId('incidents-list')).toHaveCount(0);
});

test('reports a clean fleet honestly, rather than an empty list that looks like nothing loaded', async ({
	page
}) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();

	await page.goto('/workshop/incidents');
	await expect(page.getByTestId('incidents-clean')).toBeVisible();
	await expect(page.getByTestId('incidents-clean')).toContainText('1 run checked');
	await expect(page.getByTestId('incidents-list')).toHaveCount(0);
});

test('lists a real guardrail catch, with the reason it actually gave', async ({ page }) => {
	await buildReadyBot(page, 'card-snack');

	// The same block-move scenario `telemetry.spec.ts` uses to manufacture a
	// real `guardrail.tripped` — `safety-brick.spec.ts`'s own "a blocked
	// action is refused" case is the mechanism-level proof; this only needs
	// one sitting in the store.
	await page.getByTestId(`tray-${BRICKS.safety.id}`).focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes(`${BRICKS.safety.socket} socket — this one fits`)) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');

	await page.getByTestId('socket-safety').getByRole('button').click();
	await page.getByTestId('brick-controls-safety').getByRole('checkbox', { name: 'Move' }).check();

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('flight-recorder')).toContainText('Safety rule stopped it', {
		timeout: 10_000
	});

	await page.goto('/workshop/incidents');
	await expect(page.getByTestId('incidents-list')).toBeVisible();
	const row = page.locator('[data-testid^="incident-"]').first();
	await expect(row).toContainText('Guardrail catch');
	await expect(row).toContainText('tick 1');

	// Into the full Run Lab, the same forensic depth every other Workshop
	// screen links out to rather than duplicating.
	await row.getByRole('link', { name: /Open full Run Lab/ }).click();
	await expect(page.getByTestId('run-header')).toBeVisible();
});
