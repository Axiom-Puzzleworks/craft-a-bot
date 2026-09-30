import { expect, test } from '@playwright/test';

/**
 * **Readings** (WP129, `108-READINGS.md` §6, §8): the reading desk walked by
 * keyboard alone. The error models' queue, filtered in the URL; one accepted
 * and its readout moves; one amended with a field and a value; one rejected
 * with why; the filter's state written back to the URL; and the readings
 * still there after a reload.
 */
test('the reading desk by keyboard: accept, amend, reject, and the readout moves', async ({
	page
}) => {
	await page.goto('/workshop/readings?kind=error-model');
	const readout = page.getByTestId('readings-error-model-value');
	await expect(readout).toHaveText(/^0of/);
	const items = page.locator('[data-testid^="reading-error-model-"]');
	await expect(items).toHaveCount(3);

	// Accept the first: the status says so, and the readout moves.
	const first = items.nth(0);
	await first.getByRole('button', { name: 'Accept' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByTestId('readings-count')).toContainText(': accepted.');
	await expect(readout).toHaveText(/^1of/);
	// Under the default filter (open) an accepted reading leaves the list.
	await expect(items).toHaveCount(2);

	// Amend the next: a field and a value, typed; Enter records it.
	const second = items.nth(0);
	await second.getByRole('button', { name: 'Amend…' }).focus();
	await page.keyboard.press('Enter');
	await expect(second.getByTestId('reading-field')).toBeFocused();
	await page.keyboard.type('faults.0.direction');
	await page.keyboard.press('Tab');
	await page.keyboard.type('"uniform"');
	await page.keyboard.press('Enter');
	await expect(readout).toHaveText(/^2of/);

	// Reject the last: a rejection says why, and stays open.
	const last = items.nth(0);
	await last.getByRole('button', { name: 'Reject…' }).focus();
	await page.keyboard.press('Enter');
	await expect(last.getByTestId('reading-note')).toBeFocused();
	await page.keyboard.type('The rate it names is the wrong row.');
	await page.keyboard.press('Enter');
	await expect(last.getByTestId('reading-word')).toContainText('rejected by');
	await expect(readout).toHaveText(/^2of/);
	await expect(items).toHaveCount(1);

	// The state filter goes into the URL, and a reload keeps every reading.
	await page.getByTestId('readings-state').selectOption('all');
	await expect(page).toHaveURL(/kind=error-model&state=all/);
	await expect(items).toHaveCount(3);
	await page.reload();
	await expect(page.getByTestId('readings-state')).toHaveValue('all');
	await expect(page.getByTestId('readings-error-model-value')).toHaveText(/^2of/);
	await expect(items.filter({ hasText: 'awaiting the edit' })).toHaveCount(1);
	await expect(items.filter({ hasText: 'faults.0.direction → "uniform"' })).toHaveCount(1);
});
