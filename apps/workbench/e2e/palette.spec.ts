import { expect, test } from '@playwright/test';
import { awaitRunSaved, buildReadyBot, skipTutorial } from './support.js';

/**
 * **The command palette** (WP109, `96-CONTROL-ROOM-V3.md` §2.1; `83-…`
 * §6.7.1): `Ctrl+K` opens it on any Workshop route; every rail destination
 * is reachable from it by name, in the lens's words; a stored run is
 * reachable by its id; a screen's registered action runs from it; `Escape`
 * returns focus.
 */
test.beforeEach(async ({ page }) => skipTutorial(page));

/** The rail's labels (`RAIL_LABELS`), each with its route: the palette finds every one by name. */
const ROUTES: Record<string, string> = {
	Bench: '/workshop',
	Runs: '/workshop/runs',
	Evals: '/workshop/evals',
	Campaigns: '/workshop/campaigns',
	Workflows: '/workshop/workflows',
	Evaluators: '/workshop/evaluators',
	Scenarios: '/workshop/scenarios',
	Sinks: '/workshop/sinks',
	Evidence: '/workshop/evidence',
	Playground: '/workshop/playground',
	Policies: '/workshop/policies',
	'Test bench': '/workshop/bench',
	Telemetry: '/workshop/telemetry',
	Monitor: '/workshop/monitor',
	Conduct: '/workshop/conduct',
	'Model risk': '/workshop/model-risk',
	Experiments: '/workshop/experiments',
	Incidents: '/workshop/incidents',
	'Safety case': '/workshop/safety-case',
	Assurance: '/workshop/assurance',
	Catalogue: '/workshop/catalogue',
	Audit: '/workshop/export',
	Studio: '/workshop/studio'
};

test('reaches every rail destination by name, keyboard-only', async ({ page }) => {
	await page.goto('/workshop');
	await expect(page.getByTestId('rail-palette')).toBeVisible();
	for (const [name, path] of Object.entries(ROUTES)) {
		await page.keyboard.press('Control+k');
		await expect(page.getByTestId('command-palette')).toBeVisible();
		await expect(page.getByTestId('palette-input')).toBeFocused();
		await page.keyboard.type(name);
		const first = page.getByTestId('palette-option').first();
		await expect(first).toContainText(name);
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(new RegExp(`${path.replaceAll('/', '\\/')}(\\?.*)?$`));
		await expect(page.getByTestId('command-palette')).toHaveCount(0);
	}
});

test('speaks the lens’s words: the assurance reader finds Trials, not Campaigns', async ({
	page
}) => {
	await page.goto('/workshop');
	await page.getByTestId('lens-switcher').selectOption('assurance');
	await page.getByTestId('rail-palette').click();
	await page.keyboard.type('Trials');
	await expect(page.getByTestId('palette-option').first()).toContainText('Trials');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(/\/workshop\/campaigns$/);
});

test('reaches a stored run by its id, and Escape returns focus to where it was', async ({
	page
}) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	const agentId = await buildReadyBot(page, 'card-snack');
	await page.goto(`/bench/${agentId}`);
	await page.getByRole('button', { name: /GO/ }).click();
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();
	await page.getByTestId('stop').click();
	await awaitRunSaved(page);
	await page.goto('/workshop/runs');
	const row = page.locator('[data-testid^="run-row-"]').first();
	await expect(row).toBeVisible();
	const runId = (await row.getAttribute('data-testid'))!.replace('run-row-', '');

	await page.getByTestId('rail-palette').focus();
	await page.keyboard.press('Control+k');
	await page.keyboard.type(runId.slice(0, 8));
	const hit = page.getByTestId('palette-option').first();
	await expect(hit).toHaveAttribute('data-kind', 'artefact');
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL(new RegExp(`/workshop/runs/${runId}$`));

	// The Run Lab registers its actions; the palette lists them first. Focus returns to where it was.
	await page.getByTestId('rail-palette').focus();
	await page.keyboard.press('Control+k');
	await page.keyboard.type('Explain');
	await expect(page.getByTestId('palette-option').first()).toHaveAttribute('data-kind', 'action');
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('command-palette')).toHaveCount(0);
	await expect(page.getByTestId('rail-palette')).toBeFocused();
});
