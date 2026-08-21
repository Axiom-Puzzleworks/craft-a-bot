import { expect, test } from '@playwright/test';
import { BRICKS, buildReadyBot, skipTutorial } from './support.js';

/**
 * **The safety-case worksheet** (`19-…` #28, WP34 stage C): "why is this
 * bot safe?", auto-assembled per bot — never authored.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('says so when the shelf is empty', async ({ page }) => {
	await page.goto('/workshop/safety-case');
	await expect(page.getByTestId('safety-case-no-agents')).toBeVisible();
});

test('a freshly built bot gets a real inability argument and an honest, unfinished trustworthiness section', async ({
	page
}) => {
	const agentId = await buildReadyBot(page, 'card-snack');

	await page.goto(`/workshop/safety-case?agent=${agentId}`);
	await expect(page.getByTestId('safety-case-head')).toBeVisible();

	// The Playroom offers no irreversible world action at all, and nothing
	// in a plain build reaches the Weather Line's own irreversible alert —
	// both real, evidence-backed claims, not invented ones.
	await expect(page.getByTestId('inability-list')).toContainText(
		'own world offers no irreversible action at all'
	);
	await expect(page.getByTestId('inability-list')).toContainText('Cannot use Storm alert');
	await expect(page.getByTestId('reach-list')).toHaveCount(0);

	// No Safety Brick fitted, so no rule is installed.
	await expect(page.getByTestId('control-empty')).toBeVisible();

	// Never run yet — an honest "nothing finished" rather than a 0% that
	// would look identical to "every run failed".
	await expect(page.getByTestId('trustworthiness')).toContainText('nothing finished yet');
	await expect(page.getByTestId('trustworthiness')).toContainText('0');
});

test('a blocked run shows up in both control and trustworthiness', async ({ page }) => {
	const agentId = await buildReadyBot(page, 'card-snack');

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

	await page.goto(`/workshop/safety-case?agent=${agentId}`);
	await expect(page.getByTestId('control-list')).toContainText('safety/action-blocklist');
	await expect(page.getByTestId('trustworthiness')).toContainText('1');
	await expect(page.getByTestId('trustworthiness')).toContainText('of 1 runs');

	await page.getByRole('link', { name: /See the full incident log/ }).click();
	await expect(page.getByTestId('incidents-list')).toBeVisible();
});
