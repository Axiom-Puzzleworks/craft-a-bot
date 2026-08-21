import { expect, test } from '@playwright/test';
import { BRICKS, buildAndGo, buildReadyBot, skipTutorial } from './support.js';

/**
 * **Telemetry** (`17-…` §4.6, WP34 stage A): cross-run trends broken down by
 * goal card and by cartridge, the guardrail trip mix, and the autonomy
 * numbers (`19-…` #36) — over the same runs the Kit already wrote, with no
 * export, import or conversion in between (`15-…` §7 rule 1, same as every
 * other Workshop screen).
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('says so when the run store is empty', async ({ page }) => {
	await page.goto('/workshop/telemetry');
	await expect(page.getByTestId('telemetry-empty')).toBeVisible();
	await expect(page.getByTestId('telemetry-by-card')).toHaveCount(0);
});

test('breaks a real run down by card and cartridge, honestly reporting no guardrail activity or approvals', async ({
	page
}) => {
	await buildAndGo(page, 'card-snack');
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();

	await page.goto('/workshop/telemetry');
	await expect(page.getByTestId('telemetry-by-card')).toBeVisible();
	await expect(page.getByTestId('telemetry-by-card')).toContainText('starter/snack');

	await expect(page.getByTestId('telemetry-by-cartridge')).toBeVisible();
	await expect(page.getByTestId('telemetry-by-cartridge')).toContainText('demo');

	// A plain snack run trips no guardrail and is never asked for approval —
	// the screen has to say so rather than showing a blank panel or a 0%
	// rate that looks like the same thing as "nothing has happened".
	await expect(page.getByTestId('telemetry-mix-empty')).toBeVisible();
	await expect(page.getByTestId('telemetry-autonomy')).toContainText('nothing has asked yet');
});

test('counts a tripped guardrail into the mix', async ({ page }) => {
	await buildReadyBot(page, 'card-snack');

	// Fit a Safety Brick and block the one move a snack run cannot do without
	// (`safety-brick.spec.ts`'s own "a blocked action is refused" scenario) —
	// the real, mechanism-level proof that a refusal is a `guardrail.tripped`
	// lives there; this only needs one to actually be sitting in the store.
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

	await page.goto('/workshop/telemetry');
	await expect(page.getByTestId('telemetry-mix')).toBeVisible();
	await expect(page.getByTestId('telemetry-mix')).toContainText('safety/action-blocklist');
});
