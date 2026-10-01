import { expect, test } from '@playwright/test';

/**
 * **The Control Inventory** (WP134, `110-CONTROL-SUITE-PLAN.md` §4.3): every
 * control, one row each; the matrix and the filters narrow it, the filter
 * lives in the URL, a row opens its facets with where to turn it, and the
 * catalogue opens the instances of a technique.
 */
test.beforeEach(async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
});

test('lists every control with its facets, narrows by the URL, and opens a row', async ({
	page
}) => {
	await page.goto('/workshop/controls');
	await expect(page.getByTestId('controls-lede')).toContainText('Every control');
	const shown = page.getByTestId('controls-shown');
	const total = Number((await shown.textContent())?.split(' of ')[1]);
	expect(total).toBeGreaterThan(200);
	await expect(page.getByTestId('controls-matrix')).toBeVisible();
	// Nothing stored here yet, so nothing has fired — and the page says so.
	await expect(page.getByTestId('controls-no-runs')).toBeVisible();

	await page.getByTestId('controls-filter-kind').selectOption('knob');
	await expect(page).toHaveURL(/\/workshop\/controls\?kind=knob$/);
	const knobs = Number((await shown.textContent())?.split(' of ')[0]);
	expect(knobs).toBeGreaterThan(0);
	expect(knobs).toBeLessThan(total);

	// The URL carries the filter: a reload keeps it.
	await page.goto('/workshop/controls?kind=guardrail&q=tool-blocklist');
	await expect(shown).toHaveText(`1 of ${total}`);
	await page.getByTestId('controls-table').getByText('The Connector’s scopes').click();
	const entry = page.getByTestId('controls-entry');
	await expect(entry).toContainText('guardrail:connector/tool-blocklist');
	await expect(page.getByTestId('controls-entry-coverage')).toContainText('shipped');
	await expect(page.getByTestId('controls-entry-fitted')).toContainText('the Connector brick');
	await expect(page.getByTestId('controls-entry-configure')).toContainText('the Kit');
});

test('the catalogue opens the controls that implement a technique', async ({ page }) => {
	await page.goto('/workshop/catalogue');
	await page.getByTestId('catalogue-table').getByText('Step and token budgets').first().click();
	await page.getByTestId('catalogue-open-controls').click();
	await expect(page).toHaveURL(/\/workshop\/controls\?entry=budget-cap$/);
	await expect(page.getByTestId('controls-filter-entry')).toContainText('budget-cap');
	await expect(page.getByTestId('controls-table')).toContainText('governance/step-budget');
	await page.getByTestId('controls-filter-entry-clear').click();
	await expect(page).toHaveURL(/\/workshop\/controls$/);
});
