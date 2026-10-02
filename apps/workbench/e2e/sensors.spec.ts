import { expect, test } from '@playwright/test';

/**
 * **Sensors** (WP159, `112-REAL-ENOUGH-PLAN.md` §5): the Sensor Inventory
 * walked by keyboard alone. Every event type has a row; the filter narrows to
 * the two open findings and says why; a row opens by Enter on its name and
 * shows its fields and its readers; and the lens rail reaches the page.
 */
test('the Sensor Inventory by keyboard: filter to the open findings and open one', async ({
	page
}) => {
	await page.goto('/workshop/sensors');
	await expect(page.getByTestId('sensors-count')).toContainText('34');
	await expect(page.getByTestId('sensors-shown')).toHaveText('34 of 34');
	await expect(page.getByTestId('sensors-findings')).toContainText('decision.fault');

	// The reading filter, by keyboard: only the trace list reads these two.
	const reading = page.getByTestId('sensors-filter-reading');
	await reading.focus();
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('ArrowDown');
	await expect(reading).toHaveValue('listed');
	await expect(page.getByTestId('sensors-shown')).toHaveText('2 of 34');

	// Open a row: its name is a button, Enter opens it.
	await page.getByTestId('sensors-table-row-decision.fault').getByRole('button').focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('sensors-entry')).toContainText('decision.fault');
	await expect(page.getByTestId('sensors-entry-fields')).toContainText('errorModel (optional)');
	await expect(page.getByTestId('sensors-entry-note')).toContainText('WP161');

	// Back to everything, and a search over the readers.
	await reading.selectOption('');
	await page.getByTestId('sensors-filter-q').fill('OpenTelemetry');
	await expect(page.getByTestId('sensors-shown')).not.toHaveText('34 of 34');
});

test('the rail reaches the Sensor Inventory from the Workshop', async ({ page }) => {
	await page.goto('/settings');
	await page.getByLabel('Show the Workshop').click();
	await page.goto('/workshop');
	await page.getByRole('link', { name: 'Sensors' }).click();
	await expect(page).toHaveURL(/\/workshop\/sensors$/);
	await expect(page.getByRole('heading', { name: 'Sensor Inventory' })).toBeVisible();
});
