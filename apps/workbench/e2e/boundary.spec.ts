import { expect, test } from '@playwright/test';
import { awaitRunSaved, buildReadyBot, skipTutorial } from './support.js';

/**
 * The Boundary map on its two screens (WP57 stage C, `44-…` §4.5): static
 * in the Spec Lab, and over a trace in the Run Lab where the scrubber lights
 * the edge that fired — proven on a run with the Guard brick screening
 * through Model Armor offline, so every tick carries a `guardrail.external`.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

async function openTheWorkshopDoor(page: import('@playwright/test').Page) {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
}

test('the Spec Lab draws a build’s boundary from the registry and the spec alone', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/workshop/spec/${agentId}`);
	const map = page.getByTestId('spec-boundary');
	await expect(map).toBeVisible();
	await expect(map.getByTestId('boundary-node-provider-demo')).toBeVisible();
	await expect(map.getByTestId('boundary-edge-world')).toHaveCount(1);
	await expect(map.getByRole('img')).toHaveAttribute('aria-label', /room The Playroom/);
	await expect(map.getByRole('img')).toHaveAttribute('aria-label', /not yet named/);
});

test('the Run Lab lights the Model Armor edge on the tick its guardrail.external fired', async ({
	page
}) => {
	await openTheWorkshopDoor(page);
	await buildReadyBot(page, 'card-snack');

	// The generic Guard brick over Model Armor, offline by default (`29-…` §4.6).
	await page.getByTestId('tray-workshop/guard').focus();
	await page.keyboard.press('Enter');
	for (let step = 0; step < 8; step++) {
		const said = await page.getByTestId('announcer').textContent();
		if (said?.includes('safety socket — this one fits')) break;
		await page.keyboard.press('ArrowDown');
	}
	await page.keyboard.press('Enter');
	await page.getByTestId('socket-safety').getByRole('button').click();
	await page
		.getByTestId('brick-controls-safety')
		.getByTestId('choice-serviceId')
		.selectOption({ label: 'Model Armor' });
	// Model Armor's own settings, even unplugged: without a project, a region and a
	// template the service's schema refuses and only the local floor is built.
	await page
		.getByTestId('brick-controls-safety')
		.getByLabel('Guard settings (JSON)')
		.fill('{"projectId":"proj-1","location":"europe-west2","templateId":"cab-armour"}');

	await page.getByRole('button', { name: /GO/ }).click();
	await expect(page).toHaveURL(/\/play\//);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);

	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
	await page.goto(`/workshop/runs/${runId}`);

	const map = page.getByTestId('run-boundary');
	await expect(map).toBeVisible();
	const armour = map.getByTestId('boundary-edge-guard-service:geap/model-armor');
	await expect(armour).toHaveCount(1);

	// The Run Lab opens at the last turn; tick 1 is where the screen fired.
	const scrubber = page.getByTestId('run-scrubber');
	await scrubber.fill('1');
	await expect(armour).toHaveAttribute('data-lit', 'true');
	await expect(map.getByTestId('boundary-list-guard-service:geap/model-armor')).toContainText(
		'lit'
	);

	await scrubber.fill('0');
	await expect(armour).toHaveAttribute('data-lit', 'false');
	await expect(map.getByRole('img')).toHaveAttribute('aria-label', /set to declared/);
});
