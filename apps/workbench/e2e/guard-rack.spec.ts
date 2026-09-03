import { expect, test } from '@playwright/test';
import { buildReadyBot, skipTutorial } from './support.js';

/**
 * **The Guard Rack** (`30-SECOND-VENDORS.md` §5, WP42): every registered
 * service on one shelf; a fixture test needs no key; fitting one into a bot
 * puts a Guard Brick in its safety socket, unplugged, and the bot then runs
 * its goal offline with the guard's rows on the trace (`warning-sign` through the
 * same stack is `pack-workshop`'s own unit test; the e2e uses the quick snack card).
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

test('lists every service, tests one on a fixture, fits it into a bot, and the bot runs offline through it', async ({
	page
}) => {
	const agentId = await buildReadyBot(page);

	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();

	await page.goto('/workshop/guards');
	await expect(page.getByTestId('guard-rack')).toBeVisible();
	for (const id of [
		'geap/model-armor',
		'guard-local/llama-guard',
		'guard-local/prompt-guard',
		'azure-content-safety/content-safety'
	]) {
		await expect(page.getByTestId(`guard-${id}`)).toBeVisible();
	}
	await expect(page.getByTestId('guard-credential-guard-local/llama-guard')).toContainText(
		'none needed'
	);
	await expect(
		page.getByTestId('guard-credential-azure-content-safety/content-safety')
	).toContainText('not plugged in');

	await page.getByTestId('guard-test-fixture-guard-local/llama-guard').click();
	await expect(page.getByTestId('guard-result-guard-local/llama-guard')).toContainText(
		'offline: ok — clean'
	);

	await page.getByTestId('guard-rack-agent').selectOption(agentId);
	await page.getByTestId('guard-fit-guard-local/llama-guard').click();
	await expect(page.getByTestId('guard-fitted-guard-local/llama-guard')).toContainText(
		'Fitted into'
	);

	await page.goto(`/bench/${agentId}`);
	await expect(page.getByTestId('socket-safety')).toHaveAttribute('data-fitted', 'true');
	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.getByTestId('play').click();
	await expect(page.getByTestId('end-card')).toBeVisible({ timeout: 20_000 });
	await expect(
		page.getByTestId('trace-row').filter({ hasText: 'Guard asked' }).first()
	).toBeVisible();
});
