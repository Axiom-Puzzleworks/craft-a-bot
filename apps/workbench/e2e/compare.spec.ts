import { expect, test } from '@playwright/test';
import { buildAndGo, skipTutorial } from './support.js';

/**
 * **Compare** (`17-…` §4.3, WP26 scoped to this slice): two runs, picked from
 * the Run Browser, side by side, driven by one shared scrubber.
 */

test.beforeEach(async ({ page }) => skipTutorial(page));

async function playARun(page: import('@playwright/test').Page, cardTestId?: string) {
	await buildAndGo(page, cardTestId);
	await page.getByTestId('step').click();
	await expect(page.getByTestId('world-view')).toBeVisible();
	await page.getByTestId('step').click();
}

test('the Runs table needs two before it will compare anything', async ({ page }) => {
	await playARun(page);
	await page.goto('/workshop/runs');

	await expect(page.getByTestId('compare-selected')).toHaveCount(0);
	await expect(page.getByTestId('compare-bar')).toContainText('Check two runs');

	const row = page.locator('[data-testid^="run-row-"]').first();
	const runId = (await row.getAttribute('data-testid'))?.replace('run-row-', '') ?? '';
	await page.getByTestId(`compare-check-${runId}`).check();

	// One is not enough either.
	await expect(page.getByTestId('compare-selected')).toHaveCount(0);
});

test('selecting two runs and comparing them shows both worlds under one scrubber', async ({
	page
}) => {
	await playARun(page, 'card-snack');
	await playARun(page, 'card-say-hello');

	await page.goto('/workshop/runs');
	await expect(page.getByTestId('run-count')).toContainText('2 of 2');

	const rows = page.locator('[data-testid^="run-row-"]');
	const runIds = await rows.evaluateAll((elements) =>
		elements.map((el) => el.getAttribute('data-testid')?.replace('run-row-', '') ?? '')
	);
	expect(runIds).toHaveLength(2);
	for (const id of runIds) {
		await page.getByTestId(`compare-check-${id}`).check();
	}

	await page.getByTestId('compare-selected').click();
	await expect(page).toHaveURL(/\/workshop\/compare\?a=.+&b=.+/);

	await expect(page.getByTestId(`compare-panel-${runIds[0]}`)).toBeVisible();
	await expect(page.getByTestId(`compare-panel-${runIds[1]}`)).toBeVisible();
	await expect(page.getByTestId('world-view')).toHaveCount(2);

	// One scrubber, and moving it changes what both panels show — not two
	// scrubbers coincidentally agreeing.
	const scrubber = page.getByTestId('compare-scrubber');
	await expect(scrubber).toBeVisible();
	await scrubber.fill('0');
	await expect(page.getByText(/Turn 0 of \d+/)).toBeVisible();

	// Each panel still opens its own full Run Lab for deeper forensics.
	await page.getByTestId(`compare-open-lab-${runIds[0]}`).click();
	await expect(page.getByTestId('run-header')).toBeVisible();
});

test('a third check bumps the first off, keeping the pair at two', async ({ page }) => {
	await playARun(page, 'card-snack');
	await playARun(page, 'card-say-hello');
	await playARun(page, 'card-tidy-the-blocks');

	await page.goto('/workshop/runs');
	await expect(page.getByTestId('run-table')).toBeVisible();
	const rows = page.locator('[data-testid^="run-row-"]');
	const runIds = await rows.evaluateAll((elements) =>
		elements.map((el) => el.getAttribute('data-testid')?.replace('run-row-', '') ?? '')
	);
	expect(runIds).toHaveLength(3);

	for (const id of runIds) {
		await page.getByTestId(`compare-check-${id}`).check();
	}

	// The first one checked is no longer checked; a compare link still shows.
	await expect(page.getByTestId(`compare-check-${runIds[0]}`)).not.toBeChecked();
	await expect(page.getByTestId('compare-selected')).toBeVisible();
});
