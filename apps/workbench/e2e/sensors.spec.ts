import { expect, test } from '@playwright/test';

/**
 * **Sensors** (WP159, `112-REAL-ENOUGH-PLAN.md` §5): the Sensor Inventory
 * walked by keyboard alone. Every event type has a row; the filter narrows to
 * the open findings and says why; a row opens by Enter on its name and
 * shows its fields and its readers; and the lens rail reaches the page.
 */
test('the Sensor Inventory by keyboard: filter by source and open a row', async ({ page }) => {
	await page.goto('/workshop/sensors');
	await expect(page.getByTestId('sensors-count')).toContainText('36');
	await expect(page.getByTestId('sensors-shown')).toHaveText('36 of 36');
	// Nothing is read by the trace list alone: the story reads what it once did, so no open findings.
	await expect(page.getByTestId('sensors-findings')).toHaveCount(0);
	await expect(page.getByTestId('sensors-listed')).toContainText('0');

	// The source filter, by keyboard: the seat's one event.
	const source = page.getByTestId('sensors-filter-source');
	await source.selectOption('seat');
	await expect(page.getByTestId('sensors-shown')).toHaveText('1 of 36');

	// Open the row: its name is a button, Enter opens it.
	await page.getByTestId('sensors-table-row-seat.said').getByRole('button').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('sensors-entry')).toContainText('seat.said');
	await expect(page.getByTestId('sensors-entry-fields')).toContainText('ruleId (optional)');
	await expect(page.getByTestId('sensors-entry-readers')).toContainText('The story');

	// Back to everything, and a search over the readers.
	await source.selectOption('');
	await page.getByTestId('sensors-filter-q').fill('OpenTelemetry');
	await expect(page.getByTestId('sensors-shown')).not.toHaveText('36 of 36');
});

test('the rail reaches the Sensor Inventory from the Workshop', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop');
	await page.getByRole('link', { name: 'Sensors' }).click();
	await expect(page).toHaveURL(/\/workshop\/sensors$/);
	await expect(page.getByRole('heading', { name: 'Sensor Inventory' })).toBeVisible();
});
