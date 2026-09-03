import { expect, test, type Page } from '@playwright/test';
import { SETTINGS_STORAGE_KEY } from '../src/lib/state/settings.js';
import { BRICKS, buildReadyBot, skipTutorial } from './support.js';

/**
 * **Breakpoints and live trailing** (`37-DRIFT-SAFETY-CASE-RUN-LAB.md` §4.3,
 * WP49; `17-…` §3's "not built" list): a live Kit run opened in the Run Lab
 * trails the app's own bus, a breakpoint armed there pauses the run at the
 * first `guardrail.tripped`, and Stop ends it — after which the Run Lab
 * reads the finished run back from the store and verifies its digest.
 */

/** The Workshop door, open — the Playroom's Run Lab link is behind it. */
async function openWorkshopDoor(page: Page): Promise<void> {
	await page.addInitScript((key) => {
		const storageKey = key as string;
		let settings: Record<string, unknown>;
		try {
			settings = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Record<
				string,
				unknown
			>;
		} catch {
			settings = {};
		}
		window.localStorage.setItem(
			storageKey,
			JSON.stringify({ schemaVersion: 1, ...settings, tutorialSkipped: true, workshop: true })
		);
	}, SETTINGS_STORAGE_KEY);
}

test.beforeEach(async ({ page }) => {
	await skipTutorial(page);
	await openWorkshopDoor(page);
});

test('a breakpoint pauses a live run at the first guardrail trip, the Run Lab trails it, and Stop ends it', async ({
	page
}) => {
	await buildReadyBot(page, 'card-snack');

	// A Safety Brick blocking Move: every turn of a snack run trips it (`safety-brick.spec.ts`).
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

	// One step makes the run exist; the Run Lab link appears behind the Workshop door.
	await page.getByTestId('step').click();
	await expect(page.getByTestId('flight-recorder')).toContainText('Safety rule stopped it', {
		timeout: 10_000
	});
	await page.getByTestId('open-in-run-lab').click();
	await expect(page).toHaveURL(/\/workshop\/runs\//);

	// Live, and paused between steps.
	await expect(page.getByTestId('live-chip')).toHaveAttribute('data-status', 'paused');
	await expect(page.getByTestId('live-controls')).toBeVisible();
	const rowsBefore = await page.locator('[data-testid^="row-"]').count();
	expect(rowsBefore).toBeGreaterThan(0);

	// Arm the breakpoint and let the run go: the next turn trips the blocklist and the run pauses there.
	await page.getByTestId('breakpoint-guardrail-trip').check();
	await page.getByTestId('live-resume').click();
	await expect(page.getByTestId('live-breakpoint')).toContainText('guardrail trip', {
		timeout: 15_000
	});
	await expect(page.getByTestId('live-breakpoint')).toContainText('guardrail.tripped');
	await expect(page.getByTestId('live-chip')).toHaveAttribute('data-status', 'paused');
	// The timeline trailed the bus: more rows than before, and the scrubber followed the head.
	expect(await page.locator('[data-testid^="row-"]').count()).toBeGreaterThan(rowsBefore);
	await expect(page.getByTestId('run-scrubber')).toHaveValue('2');

	// Stop ends it; the Run Lab reads the finished run back and verifies its digest.
	await page.getByTestId('live-stop').click();
	await expect(page.getByTestId('header-outcome')).toHaveText('STOPPED_BY_USER', {
		timeout: 10_000
	});
	await expect(page.getByTestId('digest-badge')).toHaveAttribute('data-verified', 'true', {
		timeout: 10_000
	});

	// A full reload empties the live bus: the same run is now a stored one, with no controls to show.
	await page.reload();
	await expect(page.getByTestId('run-header')).toBeVisible();
	await expect(page.getByTestId('live-controls')).toHaveCount(0);
	await expect(page.getByTestId('header-outcome')).toHaveText('STOPPED_BY_USER');
});
